
// --- Level 1: Derived Metrics ---

/**
 * 1. Asymmetry Index
 * Calculates the percentage difference between left and right hand RMS.
 * 0% = Perfect Symmetry, 100% = Total Asymmetry (one side 0, other > 0)
 */
export function calculateAsymmetry(leftRMS: number, rightRMS: number): number {
    const sum = leftRMS + rightRMS;
    if (sum === 0) return 0;
    return (Math.abs(leftRMS - rightRMS) / sum) * 100;
}

/**
 * 2. Clinical Severity Mapping (MDS-UPDRS Proxy)
 * Maps RMS acceleration (g) to a 0-4 clinical grade.
 */
export function getClinicalGrade(rms: number): { grade: number; label: string } {
    if (rms < 0.05) return { grade: 0, label: "Normal" };
    if (rms < 0.1) return { grade: 1, label: "Slight" };
    if (rms < 0.3) return { grade: 2, label: "Mild" };
    if (rms < 0.6) return { grade: 3, label: "Moderate" };
    return { grade: 4, label: "Severe" };
}

/**
 * 3. Frequency Drift (Fatigue Analysis)
 * Calculates linear regression slope of frequency over time.
 * Negative slope indicates fatigue (slowing down).
 */
export function calculateFrequencyDrift(history: { timestamp: number; freq: number }[]): { slope: number; status: string } {
    if (history.length < 2) return { slope: 0, status: "Insufficient Data" };

    const n = history.length;
    // Normalize time to starts at 0 (seconds)
    const startTime = history[0].timestamp;
    const x = history.map(d => (d.timestamp - startTime) / 1000);
    const y = history.map(d => d.freq);

    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
    const sumXX = x.reduce((sum, xi) => sum + xi * xi, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);

    let status = "Stable";
    if (slope < -0.05) status = "Fatigue Detected"; // Dropping > 0.05Hz per second
    if (slope > 0.05) status = "Accelerating";

    return { slope, status };
}

/**
 * 4. Tremor "Spikiness" (Crest Factor)
 * Distinguishes rhythmic tremors from jerky/myoclonic movements.
 * Peak / RMS. Sine wave is ~1.414. > 3.0 usually implies spikes.
 */
export function calculateCrestFactor(peak: number, rms: number): { score: number; isJerky: boolean } {
    if (rms === 0) return { score: 0, isJerky: false };
    const score = peak / rms;
    return { score, isJerky: score > 3.0 };
}

// --- Level 2: Raw Waveform Metrics (Requires High Frequency Array) ---

/**
 * 5. Axis of Rotation
 * Classifies tremor based on dominant axis energy.
 */
export function classifyTremorAxis(x: number[], y: number[], z: number[]): string {
    const calcRMS = (arr: number[]) => Math.sqrt(arr.reduce((s, v) => s + v * v, 0) / arr.length);

    const rmsX = calcRMS(x);
    const rmsY = calcRMS(y);
    const rmsZ = calcRMS(z);
    const total = rmsX + rmsY + rmsZ;

    if (total === 0) return "None";

    const zContribution = rmsZ / total;

    // If Z is dominant (>60%), it's likely flapping (Flexion-Extension)
    if (zContribution > 0.6) return "Flexion-Extension (Flapping)";

    // Otherwise, X/Y dominance suggests rotation
    return "Pronation-Supination (Resting)";
}

/**
 * 6. Harmonic Ratio (Spectral Purity)
 * Simplified FFT analysis to compare Fundamental vs 1st Harmonic.
 */
export function calculateHarmonicRatio(data: number[], sampleRate: number): { ratio: number; classification: string } {
    // Basic DFT implementation for simplicity (since we don't have a heavy FFT lib)
    // Focusing only on 3-12Hz range for Fundamental and its doubles

    // 1. Find Fundamental Peak (3-12Hz)
    let maxMag = 0;
    let funFreq = 0;

    // Scan frequencies 3Hz to 12Hz
    for (let f = 3; f <= 12; f += 0.5) {
        const mag = goertzelMag(data, f, sampleRate);
        if (mag > maxMag) {
            maxMag = mag;
            funFreq = f;
        }
    }

    if (maxMag === 0) return { ratio: 0, classification: "No Tremor" };

    // 2. Find Harmonic Magnitude (2 * Fundamental)
    const harmonicFreq = funFreq * 2;
    const harmonicMag = goertzelMag(data, harmonicFreq, sampleRate);

    // Avoid divide by zero, and cap at 10.0 for clinical readability
    const ratio = Math.min(10.0, harmonicMag === 0 ? 10.0 : maxMag / harmonicMag);

    return {
        ratio,
        classification: ratio > 8 ? "Pure Parkinsonian Sine" : "Complex/Essential Tremor"
    };
}

// Goertzel algorithm for single frequency magnitude
function goertzelMag(data: number[], freq: number, sampleRate: number): number {
    const w = 2 * Math.PI * freq / sampleRate;
    const cosine = Math.cos(w);
    const coeff = 2 * cosine;

    let s0 = 0, s1 = 0, s2 = 0;

    for (let i = 0; i < data.length; i++) {
        s0 = data[i] + coeff * s1 - s2;
        s2 = s1;
        s1 = s0;
    }

    const magSq = s1 * s1 + s2 * s2 - coeff * s1 * s2;
    return Math.sqrt(magSq);
}

/**
 * 7. Approximate Entropy (ApEn)
 * Measures complexity/regularity of the series.
 * Low ApEn = Regular/Robot/Organic. High ApEn = Chaotic/Psychogenic.
 * Defaults: m=2, r=0.2*std (standard)
 */
export function calculateApEn(data: number[], m: number = 2, r: number | null = null): number {
    if (data.length < 10) return 0;

    // Calculate r if not provided (0.2 * std deviation)
    if (r === null) {
        const mean = data.reduce((a, b) => a + b, 0) / data.length;
        const variance = data.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / data.length;
        r = 0.2 * Math.sqrt(variance);
    }

    // Helper to count matches
    const countMatches = (len: number) => {
        const N = data.length;
        let phiSum = 0;

        for (let i = 0; i <= N - len; i++) {
            let matches = 0;
            for (let j = 0; j <= N - len; j++) {
                let diff = 0;
                // Maximum coordinate distance
                for (let k = 0; k < len; k++) {
                    diff = Math.max(diff, Math.abs(data[i + k] - data[j + k]));
                }
                if (diff <= r!) matches++;
            }
            phiSum += Math.log(matches / (N - len + 1));
        }
        return phiSum / (N - len + 1);
    };

    const phiM = countMatches(m);
    const phiM1 = countMatches(m + 1);

    return Math.abs(phiM - phiM1);
}

/**
 * 8. Cross-Coherence (Left vs Right)
 * Uses Pearson Correlation Coefficient as a proxy for coherence/synchrony.
 */
export function calculateCrossCoherence(left: number[], right: number[]): { score: number; interpretation: string } {
    const minLen = Math.min(left.length, right.length);
    if (minLen === 0) return { score: 0, interpretation: "No Data" };

    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;

    for (let i = 0; i < minLen; i++) {
        const x = left[i];
        const y = right[i];
        sumX += x;
        sumY += y;
        sumXY += x * y;
        sumX2 += x * x;
        sumY2 += y * y;
    }

    const numerator = (minLen * sumXY) - (sumX * sumY);
    const denominator = Math.sqrt((minLen * sumX2 - sumX * sumX) * (minLen * sumY2 - sumY * sumY));

    if (denominator === 0) return { score: 0, interpretation: "Independent" };

    const r = Math.abs(numerator / denominator); // Absolute correlation
    const coherence = r * 100; // Percentage

    let interpretation = "Independent (Parkinson's)";
    if (r > 0.7) interpretation = "Coupled (Essential Tremor/Physiological)";
    else if (r > 0.3) interpretation = "Weak Coupling";

    return { score: coherence, interpretation };
}
