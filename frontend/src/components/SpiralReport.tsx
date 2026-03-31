import {
    ArrowLeft, Calendar, Clock,
    Trash2, Brain, AlertTriangle, CheckCircle, Image as ImageIcon, Activity
} from 'lucide-react';
import * as DB from '../services/db';

interface SpiralReportProps {
    record: DB.SpiralRecord;
    onBack: () => void;
    onDelete?: (id: string) => void;
    isDark: boolean;
}

export default function SpiralReport({ record, onBack, onDelete, isDark }: SpiralReportProps) {
    // Theme Constants
    const bgCard = isDark ? "bg-slate-800 border-slate-700 shadow-sm" : "bg-white border-slate-100 shadow-sm";
    const bgPanel = isDark ? "bg-slate-700/50 border-slate-600" : "bg-slate-50 border-slate-200";
    const textMain = isDark ? "text-slate-200" : "text-slate-800";
    const textSecondary = isDark ? "text-slate-400" : "text-slate-500";

    const pdRisk = record.score || 0;
    const riskLabel = record.riskLabel || (pdRisk > 75 ? 'High Risk' : pdRisk > 40 ? 'Medium Risk' : 'Low Risk');
    const confidenceLevel = record.confidenceLevel || 'High';

    const handleDelete = () => {
        if (onDelete && window.confirm("Are you sure you want to delete this record?")) {
            onDelete(record.id);
        }
    };

    return (
        <div className={`min-h-screen p-6 font-sans transition-colors relative overflow-hidden ${isDark ? "bg-slate-900 text-slate-200" : "bg-fuchsia-50 text-slate-800"}`}>
            <div className="max-w-6xl mx-auto space-y-6 relative z-10">
                {/* Header */}
                <div className="flex justify-between items-center mb-6">
                    <button onClick={onBack} className="flex items-center gap-2 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white font-bold transition">
                        <ArrowLeft className="w-5 h-5" /> Back to History
                    </button>
                    <div className="flex gap-2">
                        {onDelete && (
                            <button onClick={handleDelete} className="p-2 text-rose-600 hover:bg-rose-50 rounded-lg flex items-center gap-2 transition font-medium text-sm">
                                <Trash2 size={16} /> Delete Record
                            </button>
                        )}
                    </div>
                </div>

                <div className={`p-8 rounded-2xl border ${bgCard}`}>
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
                        <div>
                            <h3 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                                <Brain className="w-6 h-6 text-fuchsia-600" /> Spiral Pattern Analysis Report
                            </h3>
                            <div className="flex flex-wrap gap-4 mt-2 text-sm text-slate-500">
                                <div className="flex items-center gap-1"><Calendar className="w-4 h-4" /> {new Date(record.date).toLocaleDateString()}</div>
                                <div className="flex items-center gap-1"><Clock className="w-4 h-4" /> {new Date(record.date).toLocaleTimeString()}</div>
                                <div className="px-2 py-0.5 bg-fuchsia-100 text-fuchsia-800 rounded text-xs font-bold uppercase">Custom CNN Model</div>
                            </div>

                            <div className="mt-4 flex flex-col gap-1">
                                <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-bold w-max ${riskLabel === 'High Risk' ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400' :
                                    riskLabel === 'Medium Risk' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' :
                                        'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                                    }`}>
                                    {riskLabel === 'High Risk' ? '🔴' : riskLabel === 'Medium Risk' ? '🟠' : '🟢'} {riskLabel}
                                </div>
                                <div className={`text-sm flex items-center gap-1 ${confidenceLevel === 'High' ? 'text-slate-500' : 'text-amber-500 font-bold border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-3 py-1 rounded w-max'}`} title="Result falls near boundary. Please consider retesting.">
                                    ℹ️ Model Confidence: {confidenceLevel}
                                </div>
                            </div>
                        </div>
                        <div className={`px-4 py-2 rounded-xl text-center flex flex-col items-center justify-center border-2 ${riskLabel === 'High Risk' ? 'bg-rose-50 border-rose-200 text-rose-600 dark:bg-rose-900/20 dark:border-rose-800' :
                            riskLabel === 'Medium Risk' ? 'bg-orange-50 border-orange-200 text-orange-600 dark:bg-orange-900/20 dark:border-orange-800' :
                                'bg-emerald-50 border-emerald-200 text-emerald-600 dark:bg-emerald-900/20 dark:border-emerald-800'
                            }`}>
                            <span className="text-xs uppercase font-bold opacity-70 mb-1">PD Probability</span>
                            <span className="text-2xl font-black font-mono">{pdRisk.toFixed(1)}%</span>
                        </div>
                    </div>

                    <div className="grid md:grid-cols-2 gap-8 mb-8">
                        {/* Details and Inference Panel */}
                        <div className="space-y-6">
                            <div>
                                <h4 className={`font-bold text-lg mb-4 ${textMain}`}>Analysis Details</h4>
                                <div className={`p-4 rounded-xl border ${bgPanel}`}>
                                    <div className="flex justify-between items-center mb-3">
                                        <span className={textSecondary}>Features Extracted</span>
                                        <span className="font-mono font-bold text-fuchsia-500" title="Convolutional Neural Network (CNN)">Deep Spatial Features (CNN)</span>
                                    </div>
                                    <div className="flex justify-between items-center mb-3">
                                        <span className={textSecondary}>Image Pre-Process</span>
                                        <span className="font-mono font-bold">Grayscale, Resize 128x128, /255</span>
                                    </div>
                                    <div className="flex justify-between items-center mb-3">
                                        <span className={textSecondary}>Architecture</span>
                                        <span className="font-mono font-bold">4 Conv2D Layers, 2 Dense Layers</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className={textSecondary}>Classifier</span>
                                        <span className="font-mono font-bold">Softmax Activation Output</span>
                                    </div>
                                </div>
                            </div>

                            <div>
                                <h4 className={`font-bold text-lg mb-4 ${textMain}`}>Clinical Insight</h4>
                                {riskLabel === 'High Risk' ? (
                                    <div className="flex gap-3 text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/20 p-5 rounded-xl border border-rose-200 dark:border-rose-800/50">
                                        <AlertTriangle className="w-6 h-6 shrink-0 mt-0.5" />
                                        <div>
                                            <p className="font-bold text-sm mb-1">Strong PD signs detected.</p>
                                            <p className="text-sm leading-relaxed opacity-90">Micrographia or significant hesitations detected in drawing patterns consistent with motor impairment. Refer to neurologist immediately.</p>
                                        </div>
                                    </div>
                                ) : riskLabel === 'Medium Risk' ? (
                                    <div className="flex gap-3 text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20 p-5 rounded-xl border border-orange-200 dark:border-orange-800/50">
                                        <Activity className="w-6 h-6 shrink-0 mt-0.5" />
                                        <div>
                                            <p className="font-bold text-sm mb-1">Possible early PD signs.</p>
                                            <p className="text-sm leading-relaxed opacity-90">Borderline irregularities observed. Recommend monitoring symptoms over 2-4 weeks and retesting.</p>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex gap-3 text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 p-5 rounded-xl border border-emerald-200 dark:border-emerald-800/50">
                                        <CheckCircle className="w-6 h-6 shrink-0 mt-0.5" />
                                        <div>
                                            <p className="font-bold text-sm mb-1">No action needed.</p>
                                            <p className="text-sm leading-relaxed opacity-90">Smooth spiral pattern detected. No significant markers of pathological tremor or hesitation observed across the image axes. Healthy baseline.</p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Image Viewer Panel */}
                        <div className="flex flex-col items-center justify-start p-6 border-dashed border-2 rounded-2xl dark:border-slate-700 border-slate-200">
                            <h3 className={`font-bold text-lg mb-6 flex items-center gap-2 ${textMain}`}><ImageIcon className="w-5 h-5 text-fuchsia-500" /> Captured Spiral Drawing</h3>
                            {record.imageUrl ? (
                                <div className="flex flex-col gap-6 w-full items-center">
                                    <img src={record.imageUrl} alt="Patient Spiral Drawing" className={`w-full max-w-xs rounded-xl object-contain bg-white shadow-xl ${isDark ? 'border-4 border-slate-700' : 'border-4 border-slate-200'}`} />

                                    {record.heatmapUrl && (
                                        <div className="mt-4 text-center w-full flex flex-col items-center border-t border-slate-200 dark:border-slate-700 pt-6">
                                            <h4 className={`text-sm font-bold uppercase tracking-wider mb-2 flex flex-col items-center justify-center gap-1 ${textSecondary}`}>
                                                Grad-CAM Explainability
                                            </h4>
                                            <p className="text-xs text-slate-500 mb-4 max-w-xs text-center">Red/Yellow hot-zones indicate where the AI detected micro-movements or tremor signals.</p>
                                            <img src={record.heatmapUrl} alt="Grad-CAM Heatmap" title="Red areas indicate tremor signals" className={`w-full max-w-xs rounded-xl object-contain bg-white shadow-xl ${isDark ? 'border-4 border-rose-900/50' : 'border-4 border-rose-100'}`} />
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="text-center p-12 text-slate-400">
                                    <ImageIcon className="w-16 h-16 mx-auto mb-4 opacity-50" />
                                    No Image Data Saved for this Record.
                                </div>
                            )}
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
}
