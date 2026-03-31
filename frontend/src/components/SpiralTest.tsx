import React, { useRef, useState, useEffect } from 'react';
import { Activity, X, RotateCcw, Brain, CheckCircle, AlertTriangle, Loader, UploadCloud } from 'lucide-react';
import * as DB from '../services/db';

interface SpiralTestProps {
    patientId: string;
    onBack: () => void;
    isDark: boolean;
}

type SpiralTestState = 'INSTRUCTIONS' | 'DRAWING' | 'PROCESSING' | 'RESULTS';

export default function SpiralTest({ patientId, onBack, isDark }: SpiralTestProps) {
    const [state, setState] = useState<SpiralTestState>('INSTRUCTIONS');
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [hasDrawn, setHasDrawn] = useState(false);

    // Processing states
    const [processStep, setProcessStep] = useState(0);
    const [resultScore, setResultScore] = useState<number | null>(null);
    const [resultImageUrl, setResultImageUrl] = useState<string | null>(null);

    // Context colors
    const bgMain = isDark ? "bg-slate-900" : "bg-slate-50";
    const textMain = isDark ? "text-white" : "text-slate-900";
    const textSecondary = isDark ? "text-slate-400" : "text-slate-500";
    const bgCard = isDark ? "bg-slate-800 border-slate-700 shadow-sm" : "bg-white border-slate-100 shadow-sm";

    // Initialize Canvas
    useEffect(() => {
        if (state === 'DRAWING' && canvasRef.current) {
            const canvas = canvasRef.current;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.fillStyle = isDark ? '#1e293b' : '#ffffff'; // slate-800 or white
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                ctx.lineWidth = 4;
                ctx.strokeStyle = '#d946ef'; // Fuchsia
            }
        }
    }, [state, isDark]);

    const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
        setIsDrawing(true);
        draw(e);
    };

    const stopDrawing = () => {
        setIsDrawing(false);
        const canvas = canvasRef.current;
        if (canvas) {
            const ctx = canvas.getContext('2d');
            ctx?.beginPath();
        }
    };

    const getCoordinates = (e: React.MouseEvent | React.TouchEvent) => {
        const canvas = canvasRef.current;
        if (!canvas) return { x: 0, y: 0 };
        const rect = canvas.getBoundingClientRect();

        let clientX, clientY;
        if ('touches' in e) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else {
            clientX = e.clientX;
            clientY = e.clientY;
        }

        return {
            x: clientX - rect.left,
            y: clientY - rect.top
        };
    };

    const draw = (e: React.MouseEvent | React.TouchEvent) => {
        if (!isDrawing || !canvasRef.current) return;
        const ctx = canvasRef.current.getContext('2d');
        if (!ctx) return;

        const { x, y } = getCoordinates(e);

        ctx.lineTo(x, y);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x, y);

        if (!hasDrawn) setHasDrawn(true);
    };

    const clearCanvas = () => {
        if (!canvasRef.current) return;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.fillStyle = isDark ? '#1e293b' : '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.beginPath();
        }
        setHasDrawn(false);
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                const dataUrl = event.target?.result as string;
                if (dataUrl) {
                    const img = new Image();
                    img.onload = () => {
                        const resizeCanvas = document.createElement('canvas');
                        resizeCanvas.width = 224;
                        resizeCanvas.height = 224;
                        const ctx = resizeCanvas.getContext('2d');
                        if (ctx) {
                            ctx.fillStyle = isDark ? '#1e293b' : '#ffffff';
                            ctx.fillRect(0, 0, 224, 224);
                            
                            // Center and scale image properly
                            const scale = Math.min(224 / img.width, 224 / img.height);
                            const x = (224 / 2) - (img.width / 2) * scale;
                            const y = (224 / 2) - (img.height / 2) * scale;
                            ctx.drawImage(img, x, y, img.width * scale, img.height * scale);
                            
                            const resizedUrl = resizeCanvas.toDataURL('image/jpeg', 0.8);
                            startProcessingSimulation(resizedUrl);
                        } else {
                            // Fallback
                            startProcessingSimulation(dataUrl);
                        }
                    };
                    img.src = dataUrl;
                }
            };
            reader.readAsDataURL(file);
        }
    };

    const processDrawing = () => {
        if (!hasDrawn || !canvasRef.current) return;

        // Downscale image to 224x224 before serializing to save DB space and prevent AlaSQL string limit rejects
        const originalCanvas = canvasRef.current;
        const resizeCanvas = document.createElement('canvas');
        resizeCanvas.width = 224;
        resizeCanvas.height = 224;
        const ctx = resizeCanvas.getContext('2d');

        if (ctx) {
            ctx.fillStyle = isDark ? '#1e293b' : '#ffffff';
            ctx.fillRect(0, 0, 224, 224);
            ctx.drawImage(originalCanvas, 0, 0, originalCanvas.width, originalCanvas.height, 0, 0, 224, 224);
            // Use JPEG for massive compression vs standard PNG
            const dataUrl = resizeCanvas.toDataURL('image/jpeg', 0.8);
            startProcessingSimulation(dataUrl);
        } else {
            const dataUrl = originalCanvas.toDataURL('image/jpeg', 0.5); // Fallback
            startProcessingSimulation(dataUrl);
        }
    };

    const startProcessingSimulation = async (imageUrl: string) => {
        setState('PROCESSING');

        try {
            // Step 1: Image Preprocessing (Grayscale, Resize 128x128, Normalization)...
            setProcessStep(1);
            
            // Connect to real python backend API
            const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/predict/spiral`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ image: imageUrl }),
            });

            if (!response.ok) {
                let errorMsg = `Server returned ${response.status}`;
                try {
                    const errData = await response.json();
                    if (errData.error) errorMsg = errData.error;
                } catch (e) { }
                throw new Error(errorMsg);
            }

            // Step 2: Extracting Feature Maps via 4-Layer Convolutional Network...
            setProcessStep(2);
            const data = await response.json();

            // Step 3: Evaluating Probability via Fully Connected Softmax Output...
            setProcessStep(3);
            
            const finalScore = data.parkinson_risk_score;
            setResultScore(finalScore);

            setTimeout(() => {
                setResultImageUrl(imageUrl);
                setState('RESULTS');
            }, 500); // 500ms delay to show step 3 tick

        } catch (error: any) {
            console.error("ML Backend Error:", error);
            alert(`Error during spiral analysis: ${error.message || "Failed to connect to backend server"}`);
            setState('DRAWING');
        }
    };

    const handleSaveRecord = async () => {
        if (resultScore === null || !resultImageUrl) return;

        const prob = resultScore / 100;
        let riskLabel: 'Low Risk' | 'Medium Risk' | 'High Risk' = 'Low Risk';
        if (prob < 0.40) riskLabel = 'Low Risk';
        else if (prob < 0.75) riskLabel = 'Medium Risk';
        else riskLabel = 'High Risk';

        const uncertainty = -1 * (prob * Math.log(prob + 1e-6) + (1 - prob) * Math.log(1 - prob + 1e-6));
        const confidenceLevel = uncertainty > 0.68 ? 'Low - Retest Suggested' : 'High';

        const record: DB.SpiralRecord = {
            id: `SPIRAL-${Date.now()}`,
            type: 'SPIRAL',
            patient_id: patientId,
            date: Date.now(),
            score: resultScore,
            features_extracted: 2048,
            imageUrl: resultImageUrl,
            riskLabel: riskLabel,
            confidenceLevel: confidenceLevel
        };
        await DB.insertSpiralRecord(record);
        onBack();
    };

    if (state === 'INSTRUCTIONS') {
        return (
            <div className={`min-h-screen flex flex-col font-sans transition-colors ${bgMain} ${textMain} p-8 items-center justify-center`}>
                <div className={`max-w-xl w-full text-center p-12 rounded-3xl border shadow-xl ${bgCard} relative overflow-hidden`}>
                    <div className="absolute top-0 right-0 p-4 opacity-10"><Activity className="w-32 h-32 text-fuchsia-500" /></div>
                    <button onClick={onBack} className={`absolute top-6 left-6 p-2 rounded-full transition-all ${isDark ? 'bg-slate-700 hover:bg-slate-600 text-slate-300' : 'bg-slate-100 hover:bg-slate-200 text-slate-600'}`}>
                        <X className="w-5 h-5" />
                    </button>

                    <Activity className="w-16 h-16 text-fuchsia-500 mx-auto mb-6" />
                    <h2 className="text-3xl font-black mb-4">Spiral Drawing Test</h2>
                    <p className={`mb-8 leading-relaxed ${textSecondary}`}>
                        Ask the patient to draw a continuous spiral on the screen, starting from the center and moving outwards.
                        Alternatively, you can upload an existing scan of a spiral drawing. The drawing will be analyzed using a
                        Custom Convolutional Neural Network (CNN) to detect micro-tremors and hesitations indicative of Parkinson's Disease.
                    </p>

                    <div className="flex flex-col sm:flex-row gap-4">
                        <button onClick={() => setState('DRAWING')} className="flex-1 px-8 py-4 rounded-2xl font-bold bg-fuchsia-600 hover:bg-fuchsia-500 text-white shadow-xl shadow-fuchsia-500/20 transition-transform active:scale-95 text-lg flex items-center justify-center gap-2">
                            <Activity className="w-5 h-5" /> Draw on Screen
                        </button>
                        <button onClick={() => fileInputRef.current?.click()} className={`flex-1 px-8 py-4 rounded-2xl font-bold border transition-transform active:scale-95 text-lg flex items-center justify-center gap-2 ${isDark ? 'border-slate-700 hover:bg-slate-700 text-slate-300' : 'border-slate-200 hover:bg-slate-50 text-slate-600'}`}>
                            <UploadCloud className="w-5 h-5" /> Upload Image
                        </button>
                        <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept="image/*" className="hidden" />
                    </div>
                </div>
            </div>
        );
    }

    if (state === 'DRAWING') {
        return (
            <div className={`min-h-screen flex flex-col font-sans transition-colors ${bgMain} ${textMain} p-4 md:p-8 items-center`}>
                <div className="w-full max-w-2xl flex justify-between items-center mb-6">
                    <button onClick={() => setState('INSTRUCTIONS')} className={`px-4 py-2 font-bold rounded-lg ${isDark ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-900'}`}>Cancel</button>
                    <h3 className="font-black text-xl text-fuchsia-500">Draw a Spiral</h3>
                    <button onClick={clearCanvas} className={`px-4 py-2 font-bold rounded-lg flex items-center gap-2 ${isDark ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-900'}`}><RotateCcw className="w-4 h-4" /> Clear</button>
                </div>

                <div className={`rounded-3xl border-4 overflow-hidden shadow-2xl relative ${isDark ? 'border-slate-700' : 'border-slate-200'} bg-white`}>
                    <canvas
                        ref={canvasRef}
                        width={400}
                        height={400}
                        onMouseDown={startDrawing}
                        onMouseUp={stopDrawing}
                        onMouseOut={stopDrawing}
                        onMouseMove={draw}
                        onTouchStart={startDrawing}
                        onTouchEnd={stopDrawing}
                        onTouchMove={draw}
                        className="touch-none cursor-crosshair w-[400px] h-[400px]"
                    />
                    {!hasDrawn && (
                        <div className="absolute inset-0 pointer-events-none flex items-center justify-center opacity-20">
                            {/* Visual guide for a spiral */}
                            <svg width="200" height="200" viewBox="0 0 100 100" className="stroke-fuchsia-500" fill="none" strokeWidth="2" strokeDasharray="4 4">
                                <path d="M 50 50 m 0 -5 a 5 5 0 1 1 0 10 a 10 10 0 1 0 0 -20 a 15 15 0 1 1 0 30 a 20 20 0 1 0 0 -40 a 25 25 0 1 1 0 50 a 30 30 0 1 0 0 -60" />
                            </svg>
                        </div>
                    )}
                </div>

                <div className="mt-8">
                    <button
                        onClick={processDrawing}
                        disabled={!hasDrawn}
                        className="px-12 py-4 rounded-2xl font-bold bg-fuchsia-600 disabled:bg-slate-300 hover:bg-fuchsia-500 text-white shadow-xl flex items-center gap-3 transition-all text-lg"
                    >
                        <Brain className="w-5 h-5" /> Execute Spiral Analysis
                    </button>
                </div>
            </div>
        );
    }

    if (state === 'PROCESSING') {
        return (
            <div className={`min-h-screen flex flex-col font-sans transition-colors ${bgMain} ${textMain} p-8 items-center justify-center`}>
                <div className={`max-w-md w-full text-center p-12 rounded-3xl border shadow-xl ${bgCard} relative overflow-hidden`}>
                    <div className="absolute top-0 left-0 w-full h-1 bg-slate-200 dark:bg-slate-700">
                        <div className="h-full bg-fuchsia-500 transition-all duration-1000 ease-out" style={{ width: `${(processStep / 3) * 100}%` }}></div>
                    </div>

                    <Loader className="w-16 h-16 text-fuchsia-500 animate-spin mx-auto mb-8" />

                    <div className="space-y-6">
                        <div className={`flex items-center gap-3 font-bold ${processStep >= 1 ? 'text-fuchsia-500' : 'text-slate-400'}`}>
                            {processStep >= 1 ? <CheckCircle className="w-5 h-5" /> : <div className="w-5 h-5 rounded-full border-2 border-slate-300 dark:border-slate-600" />}
                            Image Preprocessing (Grayscale, Resize 128x128, Normalization)...
                        </div>
                        <div className={`flex items-center gap-3 font-bold ${processStep >= 2 ? 'text-fuchsia-500' : 'text-slate-400'}`}>
                            {processStep >= 2 ? <CheckCircle className="w-5 h-5" /> : <div className="w-5 h-5 rounded-full border-2 border-slate-300 dark:border-slate-600" />}
                            Extracting Feature Maps via 4-Layer Convolutional Network...
                        </div>
                        <div className={`flex items-center gap-3 font-bold ${processStep >= 3 ? 'text-fuchsia-500' : 'text-slate-400'}`}>
                            {processStep >= 3 ? <CheckCircle className="w-5 h-5" /> : <div className="w-5 h-5 rounded-full border-2 border-slate-300 dark:border-slate-600" />}
                            Evaluating Probability via Fully Connected Softmax Output...
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
                            <div className="flex items-center gap-2 text-fuchsia-500 font-bold uppercase tracking-widest text-sm mb-2"><Activity className="w-5 h-5" /> Custom CNN Model</div>
                            <h2 className="text-4xl font-black mb-1">Analysis Complete</h2>
                            <p className={textSecondary}>Spiral drawing evaluation recorded successfully.</p>

                            <div className="mt-4 flex flex-col gap-1">
                                <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-bold w-max ${riskLabel === 'High Risk' ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400' :
                                    riskLabel === 'Medium Risk' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' :
                                        'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                                    }`}>
                                    {riskLabel === 'High Risk' ? '🔴' : riskLabel === 'Medium Risk' ? '🟠' : '🟢'} {riskLabel}
                                </div>
                                <div className={`text-sm flex items-center gap-1 ${conf === 'High' ? 'text-slate-500' : 'text-amber-500 font-bold border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-3 py-1 rounded w-max'}`}>
                                    ℹ️ Model Confidence: {conf}
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
                                    <span className={textSecondary}>Features Extracted</span>
                                    <span className="font-mono font-bold text-fuchsia-500" title="Deep Convolutional Network">Deep Spatial Features (CNN)</span>
                                </div>
                                <div className="flex justify-between items-center mb-2">
                                    <span className={textSecondary}>Image Pre-Process</span>
                                    <span className="font-mono font-bold">Grayscale, Resize 128x128, /255</span>
                                </div>
                                <div className="flex justify-between items-center mb-2">
                                    <span className={textSecondary}>Architecture</span>
                                    <span className="font-mono font-bold">4 Conv2D Layers, 2 Dense Layers</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className={textSecondary}>Classifier</span>
                                    <span className="font-mono font-bold">Softmax Activation Output</span>
                                </div>
                            </div>

                            {riskLabel === 'High Risk' ? (
                                <div className="flex gap-3 text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/20 p-4 rounded-xl border border-rose-200 dark:border-rose-800/50 mt-4">
                                    <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                                    <div>
                                        <p className="text-sm font-bold mb-1">Strong PD signs detected.</p>
                                        <p className="text-xs opacity-90">Micrographia or significant hesitations detected. Refer to neurologist immediately.</p>
                                    </div>
                                </div>
                            ) : riskLabel === 'Medium Risk' ? (
                                <div className="flex gap-3 text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20 p-4 rounded-xl border border-orange-200 dark:border-orange-800/50 mt-4">
                                    <Activity className="w-5 h-5 shrink-0 mt-0.5" />
                                    <div>
                                        <p className="text-sm font-bold mb-1">Possible early PD signs.</p>
                                        <p className="text-xs opacity-90">Borderline irregularities observed. Recommend monitoring symptoms over 2-4 weeks and retesting.</p>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex gap-3 text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 p-4 rounded-xl border border-emerald-200 dark:border-emerald-800/50 mt-4">
                                    <CheckCircle className="w-5 h-5 shrink-0 mt-0.5" />
                                    <div>
                                        <p className="text-sm font-bold mb-1">No action needed.</p>
                                        <p className="text-xs opacity-90">Smooth spiral pattern detected. Healthy baseline.</p>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="flex flex-col items-center justify-center">
                            <h3 className={`font-bold text-lg mb-4 self-start ${textMain}`}>Captured Drawing</h3>
                            {resultImageUrl && (
                                <img src={resultImageUrl} alt="Spiral Drawing Preview" className={`w-48 h-48 border-4 rounded-xl object-contain shadow-md ${isDark ? 'border-slate-700 bg-slate-800' : 'border-slate-200 bg-white'}`} />
                            )}
                        </div>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-4 w-full mt-4">
                        <button onClick={onBack} className="flex-1 py-4 bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-white font-bold rounded-xl transition-all shadow-sm">
                            Discard & Return
                        </button>
                        <button onClick={handleSaveRecord} className="flex-1 py-4 bg-fuchsia-600 hover:bg-fuchsia-500 text-white font-bold rounded-xl transition-all shadow-xl">
                            Save Report
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return null;
}
