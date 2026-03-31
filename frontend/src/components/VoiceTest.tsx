import React, { useRef, useState, useEffect } from 'react';
import { Mic, X, CheckCircle, AlertTriangle, Loader, UploadCloud, Volume2, Activity, Square, Circle } from 'lucide-react';
import * as DB from '../services/db';
import * as AudioCache from '../services/audioCache';
import * as IndexedStorage from '../services/indexedStorage';



interface VoiceTestProps {
    patientId: string;
    onBack: () => void;
    isDark: boolean;
}

type VoiceTestState = 'INSTRUCTIONS' | 'PROCESSING' | 'RESULTS';

const SENTENCES = [
    "Sustained Vowel: Please hold the 'Ahhhh' sound for at least 3 seconds.",
    "The quick brown fox jumps over the lazy dog.",
    "She sells seashells by the seashore.",
    "A quick movement of the enemy will jeopardize six gunboats."
];

export default function VoiceTest({ patientId, onBack, isDark }: VoiceTestProps) {
    const [state, setState] = useState<VoiceTestState>('INSTRUCTIONS');
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [audioFile, setAudioFile] = useState<File | null>(null);

    const [processStep, setProcessStep] = useState(0);
    const [resultScore, setResultScore] = useState<number | null>(null);

    const [isRecording, setIsRecording] = useState(false);
    const [recordingTime, setRecordingTime] = useState(0);
    const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
    const [volume, setVolume] = useState(0);
    const audioContextRef = useRef<AudioContext | null>(null);
    const analyzerRef = useRef<AnalyserNode | null>(null);
    const animationFrameRef = useRef<number | null>(null);
    const timerRef = useRef<number | null>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const streamRef = useRef<MediaStream | null>(null);
    const [readingPrompt, setReadingPrompt] = useState(SENTENCES[0]);

    useEffect(() => {
        setReadingPrompt(SENTENCES[Math.floor(Math.random() * SENTENCES.length)]);
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
            if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
            if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
                mediaRecorderRef.current.stop();
            }
            if (audioContextRef.current) audioContextRef.current.close().catch(() => {});
            if (streamRef.current) streamRef.current.getTracks().forEach(track => track.stop());
        };
    }, []);

    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ 
                audio: true // Rely on native browser auto-gain and OS-level noise suppression
            });
            streamRef.current = stream;
            
            // Audio Visualizer Setup
            audioContextRef.current = new window.AudioContext();
            const source = audioContextRef.current.createMediaStreamSource(stream);
            const analyzer = audioContextRef.current.createAnalyser();
            analyzer.fftSize = 256;
            source.connect(analyzer);
            analyzerRef.current = analyzer;

            // MediaRecorder Setup for robust browser recording (Backend will handle transcode)
            const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
            const mediaRecorder = new MediaRecorder(stream, { mimeType });
            mediaRecorderRef.current = mediaRecorder;
            audioChunksRef.current = [];

            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) audioChunksRef.current.push(e.data);
            };

            mediaRecorder.onstop = () => {
                const blob = new Blob(audioChunksRef.current, { type: mimeType });
                const ext = mimeType.includes('webm') ? 'webm' : 'mp4';
                const file = new File([blob], `recording.${ext}`, { type: mimeType });
                
                // Debug log to ensure browser explicitly confirms data capture
                console.log(`Final Blob size: ${(blob.size / 1024).toFixed(2)} KB`);
                
                setAudioBlob(blob);
                setAudioFile(file);
                AudioCache.storeAudio('__pending__', blob);
                
                startProcessingSimulation(file);
            };

            // Start without timeslice to guarantee a contiguous, single-header WebM cluster
            // Extremely safe against FFMPEG parsing drift.
            mediaRecorder.start();

            setIsRecording(true);
            setRecordingTime(0);

            const updateVolume = () => {
                if (!analyzerRef.current) return;
                const dataArray = new Uint8Array(analyzerRef.current.frequencyBinCount);
                analyzerRef.current.getByteFrequencyData(dataArray);
                const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
                setVolume(average);
                animationFrameRef.current = requestAnimationFrame(updateVolume);
            };
            updateVolume();

            timerRef.current = window.setInterval(() => {
                setRecordingTime(prev => prev + 1);
            }, 1000);
        } catch (err) {
            console.error("Error accessing microphone:", err);
            alert("Could not access microphone. Please ensure permissions are granted.");
        }
    };

    const stopRecording = () => {
        if (isRecording) {
            setIsRecording(false);
            if (timerRef.current) clearInterval(timerRef.current);
            if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
            
            if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
                mediaRecorderRef.current.stop();
            }
            
            if (streamRef.current) streamRef.current.getTracks().forEach(track => track.stop());
            if (audioContextRef.current) {
                audioContextRef.current.close().catch(console.error);
                audioContextRef.current = null;
            }
        }
    };


    const bgMain = isDark ? "bg-slate-900" : "bg-slate-50";
    const textMain = isDark ? "text-white" : "text-slate-900";
    const textSecondary = isDark ? "text-slate-400" : "text-slate-500";
    const bgCard = isDark ? "bg-slate-800 border-slate-700 shadow-sm" : "bg-white border-slate-100 shadow-sm";

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setAudioFile(file);
            setReadingPrompt('');
            // Store file blob in pending cache
            AudioCache.storeAudio('__pending__', file);
            startProcessingSimulation(file);
        }
    };

    const startProcessingSimulation = async (file: File) => {
        setState('PROCESSING');

        try {
            setProcessStep(1);
            
            const formData = new FormData();
            formData.append('audio', file);

            const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/predict/voice`, {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                let errorMsg = `Server returned ${response.status}`;
                try {
                    const errData = await response.json();
                    if (errData.error) errorMsg = errData.error;
                } catch (e) { }
                throw new Error(errorMsg);
            }

            setProcessStep(2);
            const data = await response.json();

            setProcessStep(3);
            const finalScore = data.parkinson_risk_score;
            setResultScore(finalScore);

            // Replace frontend recording with the pristine transcoded WAV from backend
            if (data.processed_audio_b64) {
                try {
                    const binaryString = window.atob(data.processed_audio_b64);
                    const bytes = new Uint8Array(binaryString.length);
                    for (let i = 0; i < binaryString.length; i++) {
                        bytes[i] = binaryString.charCodeAt(i);
                    }
                    const wavBlob = new Blob([bytes], { type: 'audio/wav' });
                    const wavFile = new File([wavBlob], 'analysis.wav', { type: 'audio/wav' });
                    setAudioBlob(wavBlob);
                    setAudioFile(wavFile);
                    AudioCache.storeAudio('__pending__', wavBlob);
                } catch (e) {
                    console.error("Failed to decode backend WAV", e);
                }
            }

            setTimeout(() => {
                setState('RESULTS');
            }, 500);

        } catch (error: any) {
            console.error("ML Backend Error:", error);
            alert(`Error during analysis: ${error.message || "Failed to connect to backend server"}`);
            setState('INSTRUCTIONS');
            setAudioFile(null);
        }
    };

    const handleSaveRecord = async () => {
        if (resultScore === null) return;

        const prob = resultScore / 100;
        let riskLabel: 'Low Risk' | 'Medium Risk' | 'High Risk' = 'Low Risk';
        if (prob < 0.40) riskLabel = 'Low Risk';
        else if (prob < 0.75) riskLabel = 'Medium Risk';
        else riskLabel = 'High Risk';

        const uncertainty = -1 * (prob * Math.log(prob + 1e-6) + (1 - prob) * Math.log(1 - prob + 1e-6));
        const confidenceLevel = uncertainty > 0.68 ? 'Low - Retest Suggested' : 'High';

        const recordId = `VOICE-${Date.now()}`;

        // Convert blob to Base64 data URL so it persists in DB across sessions
        const blobToStore = audioBlob || (audioFile ? audioFile : null);
        if (blobToStore) {
            // Store permanently in native IndexedDB format to bypass 5MB localStorage crash string limits
            try {
                await IndexedStorage.storeAudioBlob(recordId, blobToStore);
            } catch (err) {
                console.error("Failed to save audio to IndexedDB vault", err);
            }
            // Store in in-memory cache for the current session (instant playback)
            AudioCache.storeAudio(recordId, blobToStore);
        }
        // Clean up the pending slot
        AudioCache.revokeAudio('__pending__');

        const record: DB.VoiceRecord = {
            id: recordId,
            type: 'VOICE',
            patient_id: patientId,
            date: Date.now(),
            score: resultScore,
            riskLabel: riskLabel,
            confidenceLevel: confidenceLevel,
            audioUrl: '', // Left blank; raw recording handled by IndexedDB natively
            prompt: readingPrompt
        };
        await DB.insertVoiceRecord(record);
        onBack();
    };

    if (state === 'INSTRUCTIONS') {
        return (
            <div className={`min-h-screen flex flex-col font-sans transition-colors ${bgMain} ${textMain} p-8 items-center justify-center`}>
                <div className={`max-w-xl w-full text-center p-12 rounded-3xl border shadow-xl ${bgCard} relative overflow-hidden`}>
                    <div className="absolute top-0 right-0 p-4 opacity-10"><Mic className="w-32 h-32 text-indigo-500" /></div>
                    <button onClick={onBack} className={`absolute top-6 left-6 p-2 rounded-full transition-all ${isDark ? 'bg-slate-700 hover:bg-slate-600 text-slate-300' : 'bg-slate-100 hover:bg-slate-200 text-slate-600'}`}>
                        <X className="w-5 h-5" />
                    </button>

                    <Mic className="w-16 h-16 text-indigo-500 mx-auto mb-6" />
                    <h2 className="text-3xl font-black mb-4">Speech & Voice Analysis</h2>
                    <p className={`mb-6 leading-relaxed ${textSecondary}`}>
                        Please instruct the patient to read the following text aloud or hold the vowel sound. Record for at least 3 seconds.
                    </p>

                    <div className={`p-6 rounded-2xl mb-8 ${isDark ? 'bg-slate-700/50' : 'bg-indigo-50 border border-indigo-100'} text-center`}>
                        <p className={`text-xl font-medium italic ${isDark ? 'text-indigo-300' : 'text-indigo-700'}`}>"{readingPrompt}"</p>
                    </div>

                    {!isRecording ? (
                        <div className="flex flex-col gap-4">
                            <button onClick={startRecording} className={`w-full px-8 py-4 rounded-2xl font-bold border transition-transform active:scale-95 text-lg flex items-center justify-center gap-2 ${isDark ? 'bg-rose-600 hover:bg-rose-500 text-white border-transparent' : 'bg-rose-600 hover:bg-rose-700 text-white border-transparent'}`}>
                                <Circle className="w-5 h-5 fill-current" /> Start Recording
                            </button>
                            <div className="flex items-center gap-4">
                                <div className="h-px bg-slate-200 dark:bg-slate-700 flex-1"></div>
                                <span className="text-sm font-medium text-slate-400">OR</span>
                                <div className="h-px bg-slate-200 dark:bg-slate-700 flex-1"></div>
                            </div>
                            <button onClick={() => fileInputRef.current?.click()} className={`w-full px-8 py-3 rounded-2xl font-bold border transition-transform active:scale-95 flex items-center justify-center gap-2 ${isDark ? 'bg-slate-700 hover:bg-slate-600 text-slate-300 border-transparent' : 'bg-white hover:bg-slate-50 text-slate-600 border-slate-200 shadow-sm'}`}>
                                <UploadCloud className="w-5 h-5" /> Upload File
                            </button>
                            <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept="audio/*" className="hidden" />
                        </div>
                    ) : (
                        <div className="flex flex-col gap-4 animate-in fade-in zoom-in duration-300">
                            <div className="flex justify-center items-center gap-3 mb-2">
                                <div className="w-3 h-3 rounded-full bg-rose-500 animate-pulse"></div>
                                <span className="text-2xl font-mono font-bold text-rose-500">
                                    00:{recordingTime.toString().padStart(2, '0')}
                                </span>
                            </div>

                            {/* Volume Indicator */}
                            <div className="w-full h-8 bg-slate-100 dark:bg-slate-700/50 rounded-full overflow-hidden mb-4 p-1 border border-slate-200 dark:border-slate-700">
                                <div 
                                    className={`h-full rounded-full transition-all duration-75 ${volume > 50 ? 'bg-indigo-500' : 'bg-indigo-400 opacity-50'}`}
                                    style={{ width: `${Math.min(100, (volume / 128) * 100)}%` }}
                                ></div>
                            </div>

                            <button onClick={stopRecording} className={`w-full px-8 py-4 rounded-2xl font-bold border transition-transform active:scale-95 text-lg flex items-center justify-center gap-2 border-rose-500 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20`}>
                                <Square className="w-5 h-5 fill-current" /> Stop & Analyze
                            </button>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    if (state === 'PROCESSING') {
        return (
            <div className={`min-h-screen flex flex-col font-sans transition-colors ${bgMain} ${textMain} p-8 items-center justify-center`}>
                <div className={`max-w-md w-full text-center p-12 rounded-3xl border shadow-xl ${bgCard} relative overflow-hidden`}>
                    <div className="absolute top-0 left-0 w-full h-1 bg-slate-200 dark:bg-slate-700">
                        <div className="h-full bg-indigo-500 transition-all duration-1000 ease-out" style={{ width: `${(processStep / 3) * 100}%` }}></div>
                    </div>

                    <Loader className="w-16 h-16 text-indigo-500 animate-spin mx-auto mb-8" />

                    <div className="space-y-6">
                        <div className={`flex items-center gap-3 font-bold ${processStep >= 1 ? 'text-indigo-500' : 'text-slate-400'}`}>
                            {processStep >= 1 ? <CheckCircle className="w-5 h-5" /> : <div className="w-5 h-5 rounded-full border-2 border-slate-300 dark:border-slate-600" />}
                            Audio Initialization & Sampling at 22kHz...
                        </div>
                        <div className={`flex items-center gap-3 font-bold ${processStep >= 2 ? 'text-indigo-500' : 'text-slate-400'}`}>
                            {processStep >= 2 ? <CheckCircle className="w-5 h-5" /> : <div className="w-5 h-5 rounded-full border-2 border-slate-300 dark:border-slate-600" />}
                            MFCC Feature Extraction (360x40 Tensors)...
                        </div>
                        <div className={`flex items-center gap-3 font-bold ${processStep >= 3 ? 'text-indigo-500' : 'text-slate-400'}`}>
                            {processStep >= 3 ? <CheckCircle className="w-5 h-5" /> : <div className="w-5 h-5 rounded-full border-2 border-slate-300 dark:border-slate-600" />}
                            Voice CNN Inferences & Score Calculation...
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    if (state === 'RESULTS') {
        const pdRisk = resultScore || 0;
        const prob = pdRisk / 100;
        let riskLabel = 'Low Risk';
        if (prob < 0.40) riskLabel = 'Low Risk';
        else if (prob < 0.75) riskLabel = 'Medium Risk';
        else riskLabel = 'High Risk';

        const entropy = -1 * (prob * Math.log(prob + 1e-6) + (1 - prob) * Math.log(1 - prob + 1e-6));
        const conf = entropy > 0.68 ? 'Low - Retest Suggested' : 'High';

        return (
            <div className={`min-h-screen flex flex-col font-sans transition-colors ${bgMain} ${textMain} p-4 md:p-8 items-center justify-center`}>
                <div className={`max-w-2xl w-full p-8 md:p-12 rounded-3xl border shadow-xl ${bgCard} relative overflow-hidden`}>

                    <div className="flex justify-between items-start mb-8">
                        <div>
                            <div className="flex items-center gap-2 text-indigo-500 font-bold uppercase tracking-widest text-sm mb-2"><Mic className="w-5 h-5" /> CNN Voice Model</div>
                            <h2 className="text-4xl font-black mb-1">Analysis Complete</h2>
                            <p className={textSecondary}>Voice evaluation processed carefully through MFCC metrics.</p>

                            <div className="mt-4 flex flex-col gap-1">
                                <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-bold w-max ${riskLabel === 'High Risk' ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400' :
                                    riskLabel === 'Medium Risk' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' :
                                        'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                                    }`}>
                                    {riskLabel === 'High Risk' ? '1' : riskLabel === 'Medium Risk' ? '2' : '3'} {riskLabel}
                                </div>
                                <div className={`text-sm flex items-center gap-1 ${conf === 'High' ? 'text-slate-500' : 'text-amber-500 font-bold border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-3 py-1 rounded w-max'}`}>
                                    Confidence: {conf}
                                </div>
                            </div>
                        </div>
                        <div className={`p-4 rounded-2xl flex flex-col items-center justify-center border-2 ${riskLabel === 'High Risk' ? 'bg-rose-50 border-rose-200 text-rose-600 dark:bg-rose-900/20 dark:border-rose-800' :
                            riskLabel === 'Medium Risk' ? 'bg-orange-50 border-orange-200 text-orange-600 dark:bg-orange-900/20 dark:border-orange-800' :
                                'bg-emerald-50 border-emerald-200 text-emerald-600 dark:bg-emerald-900/20 dark:border-emerald-800'
                            }`}>
                            <span className="text-xs uppercase font-bold opacity-70 mb-1">PD Probability</span>
                            <span className="text-4xl font-black font-mono">{pdRisk.toFixed(1)}%</span>
                        </div>
                    </div>

                    <div className="grid md:grid-cols-2 gap-8 mb-8">
                        <div className="space-y-4">
                            <h3 className={`font-bold text-lg mb-4 ${textMain}`}>Prediction Details</h3>
                            <div className={`p-4 rounded-xl border ${isDark ? 'bg-slate-900/50 border-slate-700' : 'bg-slate-50 border-slate-100'}`}>
                                <div className="flex justify-between items-center mb-2">
                                    <span className={textSecondary}>Acoustic Features</span>
                                    <span className="font-mono font-bold text-indigo-500" title="Mel-Frequency Cepstral Coefficients">MFCCs (40 bands)</span>
                                </div>
                                <div className="flex justify-between items-center mb-2">
                                    <span className={textSecondary}>Audio Target</span>
                                    <span className="font-mono font-bold">3 Seconds @ 22kHz</span>
                                </div>
                                <div className="flex justify-between items-center mb-2">
                                    <span className={textSecondary}>Architecture</span>
                                    <span className="font-mono font-bold">MFCC Audio CNN</span>
                                </div>
                            </div>

                            {riskLabel === 'High Risk' ? (
                                <div className="flex gap-3 text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/20 p-4 rounded-xl border border-rose-200 dark:border-rose-800/50 mt-4">
                                    <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                                    <div>
                                        <p className="text-sm font-bold mb-1">Acoustic variations detected.</p>
                                        <p className="text-xs opacity-90">Micro-tremors and volume fluctuations consistent with dysarthria detected.</p>
                                    </div>
                                </div>
                            ) : riskLabel === 'Medium Risk' ? (
                                <div className="flex gap-3 text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20 p-4 rounded-xl border border-orange-200 dark:border-orange-800/50 mt-4">
                                    <Activity className="w-5 h-5 shrink-0 mt-0.5" />
                                    <div>
                                        <p className="text-sm font-bold mb-1">Borderline voice jitter.</p>
                                        <p className="text-xs opacity-90">Slight irregularities in pitch and amplitude. Recommend retesting.</p>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex gap-3 text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 p-4 rounded-xl border border-emerald-200 dark:border-emerald-800/50 mt-4">
                                    <CheckCircle className="w-5 h-5 shrink-0 mt-0.5" />
                                    <div>
                                        <p className="text-sm font-bold mb-1">Stable vocals detected.</p>
                                        <p className="text-xs opacity-90">Smooth speech tones with no significant tremor interruptions.</p>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="flex flex-col items-center justify-center">
                            <h3 className={`font-bold text-lg mb-4 self-start ${textMain}`}>Captured Audio Track</h3>
                            {audioFile && (
                                <div className={`w-full p-6 text-center border-4 rounded-xl border-dashed bg-white shadow-md ${isDark ? 'border-slate-700 bg-slate-800' : 'border-slate-200 bg-slate-50'}`}>
                                    <Volume2 className="w-16 h-16 text-indigo-500 mx-auto mb-4 opacity-50" />
                                    <p className="text-sm font-bold mb-4">{audioFile.name}</p>
                                    <audio controls src={URL.createObjectURL(audioBlob || audioFile)} className="w-full mb-2" />
                                    <p className="text-xs text-slate-500">{(audioFile.size / 1024).toFixed(1)} KB</p>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-4 w-full mt-4">
                        <button onClick={onBack} className="flex-1 py-4 bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-white font-bold rounded-xl transition-all shadow-sm">
                            Discard & Return
                        </button>
                        <button onClick={handleSaveRecord} className="flex-1 py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl transition-all shadow-xl">
                            Save Report
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return null;
}
