
import { useState } from 'react';
import {
    Activity, ArrowLeft, Calendar, Clock, Download,
    Trash2, ArrowLeftRight
} from 'lucide-react';
import * as DB from '../services/db';
import RealtimeChart from './RealtimeChart';

interface TremorReportProps {
    record: DB.TremorRecord;
    onBack: () => void;
    onDelete?: (id: string) => void;
    isDark: boolean;
}

export default function TremorReport({ record, onBack, onDelete, isDark }: TremorReportProps) {
    const [activeTab, setActiveTab] = useState<'LEFT' | 'RIGHT'>('RIGHT');

    // Theme Constants
    const bgCard = isDark ? "bg-slate-800 border-slate-700 shadow-sm" : "bg-white border-slate-100 shadow-sm";
    const bgPanel = isDark ? "bg-slate-700/50 border-slate-600" : "bg-slate-50 border-slate-200";
    const textMain = isDark ? "text-slate-200" : "text-slate-800";

    const handData = activeTab === 'LEFT' ? record.left_hand : record.right_hand;
    const isRecorded = handData.recorded;

    // Clinical Interpretation LogicAsymmetry
    const leftRMS = record.left_hand.recorded ? record.left_hand.avg_rms : 0;
    const rightRMS = record.right_hand.recorded ? record.right_hand.avg_rms : 0;
    const meanRMS = (leftRMS + rightRMS) / 2;
    const asymmetryIndex = meanRMS > 0
        ? (Math.abs(leftRMS - rightRMS) / meanRMS) * 100
        : 0;
    const asymmetryLabel = asymmetryIndex > 30 ? "High (Possible PD)" : asymmetryIndex < 10 ? "Low (Essential/Physiological)" : "Moderate";
    const asymmetryColor = asymmetryIndex > 30 ? "text-red-600" : "text-emerald-600";

    const getClinicalInsight = (data: typeof handData) => {
        if (!data.recorded) return "No assessment data available for this hand.";

        const insights = [];
        if (data.tremor_detected) {
            insights.push("Tremor activity detected.");
            if (data.avg_freq > 4 && data.avg_freq < 7) insights.push("Frequency consistent with parkinsonian-type rest tremor.");
            else if (data.avg_freq >= 7 && data.avg_freq < 12) insights.push("Frequency suggestive of essential or physiological tremor.");
        } else {
            insights.push("No clinically significant tremor detected.");
        }

        if (data.amplitude_cov > 30) insights.push("High amplitude variability suggests potential bursts or inconsistent sustainment.");
        if (data.rhythmicity > 0.8) insights.push("Highly rhythmic pattern observed.");

        return insights.join(" ");
    };

    const exportCSV = () => {
        const headers = "Hand,Timestamp,Frequency (Hz),RMS,Max,TremorDetected\n";

        const rowsLeft = record.left_hand.samples.map(d => `Left,${d.timestamp},${d.freq},${d.rms},${d.max},${d.tremor}`).join("\n");
        const rowsRight = record.right_hand.samples.map(d => `Right,${d.timestamp},${d.freq},${d.rms},${d.max},${d.tremor}`).join("\n");

        const blob = new Blob([headers + rowsLeft + "\n" + rowsRight], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `tremor_data_${record.id}.csv`;
        a.click();
    };

    const handleDelete = () => {
        if (onDelete && window.confirm("Are you sure you want to delete this record?")) {
            onDelete(record.id);
        }
    };

    return (
        <div className={`min-h-screen p-6 font-sans transition-colors relative overflow-hidden ${isDark ? "bg-slate-900 text-slate-200" : "bg-indigo-50 text-slate-800"}`}>


            <div className="max-w-6xl mx-auto space-y-6 relative z-10">

                {/* Header */}
                <div className="flex justify-between items-center mb-6">
                    <button onClick={onBack} className="flex items-center gap-2 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white font-bold transition">
                        <ArrowLeft className="w-5 h-5" /> Back to History
                    </button>
                    <div className="flex gap-2">
                        <button onClick={exportCSV} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg flex items-center gap-2 transition font-medium text-sm">
                            <Download size={16} /> Export CSV
                        </button>
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
                                <Activity className="w-6 h-6 text-blue-600" /> Tremor Analysis Report
                            </h3>
                            <div className="flex flex-wrap gap-4 mt-2 text-sm text-slate-500">
                                <div className="flex items-center gap-1"><Calendar className="w-4 h-4" /> {new Date(record.date).toLocaleDateString()}</div>
                                <div className="flex items-center gap-1"><Clock className="w-4 h-4" /> {new Date(record.date).toLocaleTimeString()}</div>
                                {record.notes && <div className="px-2 py-0.5 bg-yellow-100 text-yellow-800 rounded text-xs font-bold uppercase">{record.notes}</div>}
                            </div>
                        </div>
                        <div className={`px-4 py-2 rounded-xl text-center ${(record.left_hand.tremor_detected || record.right_hand.tremor_detected) ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
                            <div className="text-xs font-bold uppercase tracking-wider opacity-70">Result</div>
                            <div className="text-xl font-black">{(record.left_hand.tremor_detected || record.right_hand.tremor_detected) ? "TREMOR DETECTED" : "NORMAL STABILITY"}</div>
                        </div>
                    </div>


                    {/* Clinical Interpretation Banner */}
                    <div className="mb-6 p-4 bg-indigo-50 rounded-2xl border border-indigo-100 flex gap-4 items-start">
                        <div className="p-2 bg-indigo-100 rounded-lg text-indigo-600 mt-1">
                            <Activity size={20} />
                        </div>
                        <div>
                            <h4 className="font-bold text-indigo-900 text-sm uppercase tracking-wide mb-1">Clinical Interpretation</h4>
                            <p className="text-indigo-800 leading-relaxed text-sm">
                                {getClinicalInsight(handData)}
                            </p>
                        </div>
                    </div>

                    {/* Asymmetry Analysis */}
                    {record.left_hand.recorded && record.right_hand.recorded && (
                        <div className={`mb-8 p-6 rounded-2xl border ${bgPanel}`}>
                            <h3 className={`text-sm font-bold uppercase tracking-widest mb-4 flex items-center gap-2 ${isDark ? "text-slate-400" : "text-slate-500"}`}><ArrowLeftRight className="w-4 h-4" /> Lateral Asymmetry Analysis</h3>
                            <div className="flex items-center gap-8">
                                <div className="flex-1">
                                    <div className="flex justify-between items-end mb-2">
                                        <div className="text-xs font-bold text-slate-400">RMS Difference</div>
                                        <div className={`text-xl font-bold ${asymmetryColor}`}>{asymmetryIndex.toFixed(1)}% <span className="text-sm text-slate-400 font-medium">({asymmetryLabel})</span></div>
                                    </div>
                                    <div className={`h-3 rounded-full overflow-hidden flex ${isDark ? "bg-slate-700" : "bg-slate-200"}`}>
                                        <div className="h-full bg-blue-500" style={{ width: `${(record.left_hand.avg_rms / (record.left_hand.avg_rms + record.right_hand.avg_rms)) * 100}%` }} title="Left Hand Contribution"></div>
                                        <div className="h-full bg-purple-500" style={{ width: `${(record.right_hand.avg_rms / (record.left_hand.avg_rms + record.right_hand.avg_rms)) * 100}%` }} title="Right Hand Contribution"></div>
                                    </div>
                                    <div className="flex justify-between mt-1 text-[10px] font-bold text-slate-400">
                                        <span>LEFT HAND</span>
                                        <span>RIGHT HAND</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* TABS */}
                    <div className={`flex gap-2 mb-8 p-1 rounded-xl ${isDark ? "bg-slate-900" : "bg-slate-100"}`}>
                        <button onClick={() => setActiveTab('RIGHT')} className={`flex-1 py-3 rounded-lg font-bold text-sm transition-all ${activeTab === 'RIGHT' ? (isDark ? 'bg-slate-700 text-indigo-400 shadow-sm' : 'bg-white text-indigo-600 shadow-sm') : (isDark ? 'text-slate-400 hover:text-slate-300' : 'text-slate-500 hover:text-slate-700')}`}>RIGHT HAND</button>
                        <button onClick={() => setActiveTab('LEFT')} className={`flex-1 py-3 rounded-lg font-bold text-sm transition-all ${activeTab === 'LEFT' ? (isDark ? 'bg-slate-700 text-indigo-400 shadow-sm' : 'bg-white text-indigo-600 shadow-sm') : (isDark ? 'text-slate-400 hover:text-slate-300' : 'text-slate-500 hover:text-slate-700')}`}>LEFT HAND</button>
                    </div>

                    {!isRecorded ? (
                        <div className="p-12 text-center text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                            No data recorded for {activeTab} hand in this session.
                        </div>
                    ) : (
                        <>
                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                                <div className={`p-4 rounded-xl border ${bgPanel}`}>
                                    <div className="text-xs font-bold text-slate-400 uppercase mb-1">Frequency</div>
                                    <div className={`text-2xl font-black ${isDark ? "text-white" : "text-slate-800"}`}>{handData.avg_freq.toFixed(1)} <span className="text-sm text-slate-400 font-medium">Hz</span></div>
                                </div>
                                <div className={`p-4 rounded-xl border ${bgPanel}`}>
                                    <div className="text-xs font-bold text-slate-400 uppercase mb-1">Amplitude (RMS)</div>
                                    <div className={`text-2xl font-black ${isDark ? "text-white" : "text-slate-800"}`}>{handData.avg_rms.toFixed(2)}</div>
                                </div>
                                <div className={`p-4 rounded-xl border ${bgPanel}`}>
                                    <div className="text-xs font-bold text-slate-400 uppercase mb-1">Peak Amp</div>
                                    <div className={`text-2xl font-black ${isDark ? "text-white" : "text-slate-800"}`}>{handData.max_amp.toFixed(2)}</div>
                                </div>
                                <div className={`p-4 rounded-xl border ${bgPanel}`}>
                                    <div className="text-xs font-bold text-slate-400 uppercase mb-1">Tremor Density (Burden)</div>
                                    <div className={`text-2xl font-black ${isDark ? "text-white" : "text-slate-800"}`}>{(handData.tremor_density || 0).toFixed(1)}%</div>
                                </div>
                            </div>


                            <div className="space-y-8">
                                {/* Advanced Motor Markers */}
                                <div>
                                    <h4 className="font-bold text-slate-800 mb-4 border-b pb-2">Advanced Motor Markers</h4>
                                    <div className="grid md:grid-cols-4 lg:grid-cols-5 gap-4">
                                        <div className={`p-4 rounded-2xl border ${bgPanel}`}>
                                            <div className="text-[10px] font-bold text-slate-400 uppercase">Tremor Density</div>
                                            <div className="text-xl font-bold text-slate-700">{(handData.tremor_density || 0).toFixed(1)}%</div>
                                        </div>
                                        <div className={`p-4 rounded-2xl border ${bgPanel}`}>
                                            <div className="text-[10px] font-bold text-slate-400 uppercase">Rhythmicity</div>
                                            <div className="text-xl font-bold text-slate-700">{(handData.rhythmicity || 0).toFixed(2)}</div>
                                        </div>
                                        <div className={`p-4 rounded-2xl border ${bgPanel}`}>
                                            <div className="text-[10px] font-bold text-slate-400 uppercase">Crest Factor</div>
                                            <div className="text-xl font-bold text-slate-700">{(handData.crest_factor || 0).toFixed(2)}</div>
                                        </div>
                                        <div className={`p-4 rounded-2xl border ${bgPanel}`}>
                                            <div className="text-[10px] font-bold text-slate-400 uppercase">Harmonic Ratio</div>
                                            <div className="text-xl font-bold text-slate-700">{(handData.harmonic_ratio || 0).toFixed(1)}</div>
                                        </div>
                                        <div className={`p-4 rounded-2xl border ${bgPanel}`}>
                                            <div className="text-[10px] font-bold text-slate-400 uppercase">Approx. Entropy</div>
                                            <div className="text-xl font-bold text-slate-700">{(handData.approx_entropy || 0).toFixed(2)}</div>
                                        </div>
                                        <div className={`p-4 rounded-2xl border ${bgPanel}`}>
                                            <div className="text-[10px] font-bold text-slate-400 uppercase">Freq. Drift (Slope)</div>
                                            <div className={`text-xl font-bold ${(handData.frequency_drift || 0) < -0.05 ? 'text-amber-600' : 'text-slate-700'}`}>
                                                {(handData.frequency_drift || 0).toFixed(3)}
                                            </div>
                                        </div>
                                        <div className={`p-4 rounded-2xl border ${bgPanel}`}>
                                            <div className="text-[10px] font-bold text-slate-400 uppercase">Amp. Variability</div>
                                            <div className="text-xl font-bold text-slate-700">{(handData.amplitude_variability || 0).toFixed(2)}</div>
                                        </div>
                                        <div className={`p-4 rounded-2xl border ${bgPanel} col-span-2 md:col-span-1 lg:col-span-1`}>
                                            <div className="text-[10px] font-bold text-slate-400 uppercase">Severity Score</div>
                                            <div className={`text-xl font-black ${(handData.severity_score || 0) > 5 ? 'text-red-600' : 'text-emerald-600'}`}>
                                                {(handData.severity_score || 0).toFixed(1)}<span className="text-xs text-slate-400 ml-1">/10</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Kinematic Analysis */}
                                <div>
                                    <h4 className="font-bold text-slate-800 mb-4 border-b pb-2">Kinematic Analysis</h4>
                                    <div className="grid md:grid-cols-2 gap-4">
                                        <div className={`p-5 rounded-2xl border ${bgPanel} flex flex-col justify-center`}>
                                            <div className="text-xs font-bold text-slate-400 uppercase mb-1">Dominant Axis of Rotation</div>
                                            <div className="text-lg font-bold text-indigo-700">
                                                {handData.axis_classification || "N/A"}
                                            </div>
                                            <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                                                Based on 3-axis simulation relative to RMS/Frequency profile.
                                            </p>
                                        </div>

                                        {record.left_hand.recorded && record.right_hand.recorded && (
                                            <div className={`p-5 rounded-2xl border ${bgPanel} flex flex-col justify-center`}>
                                                <div className="text-xs font-bold text-slate-400 uppercase mb-1">Cross-Coherence (Synchronization)</div>
                                                <div className="flex items-baseline gap-2">
                                                    <div className="text-2xl font-black text-slate-800">
                                                        {(record.cross_coherence || 0).toFixed(1)}%
                                                    </div>
                                                    <div className="text-sm font-bold text-slate-500">
                                                        {record.cross_coherence > 70 ? "(Linked)" : "(Independent)"}
                                                    </div>
                                                </div>
                                                <div className="w-full bg-slate-200 rounded-full h-2 mt-3 overflow-hidden">
                                                    <div className="bg-indigo-500 h-full rounded-full transition-all duration-1000" style={{ width: `${record.cross_coherence || 0}%` }}></div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div>
                                    <h4 className={`font-bold mb-4 border-b pb-2 ${textMain}`}>Frequency Analysis (Hz)</h4>
                                    <div className={`p-4 rounded-2xl border ${bgPanel}`}>
                                        <RealtimeChart
                                            data={handData.samples}
                                            dataKey="freq"
                                            color={activeTab === 'LEFT' ? "#3b82f6" : "#a855f7"}
                                            label="Frequency"
                                            domain={[0, 12]}
                                            height={200}
                                            isDark={isDark}
                                        />
                                    </div>
                                </div>

                                <div>
                                    <h4 className={`font-bold mb-4 border-b pb-2 ${textMain}`}>Severity Analysis (RMS)</h4>
                                    <div className={`p-4 rounded-2xl border ${bgPanel}`}>
                                        <RealtimeChart
                                            data={handData.samples}
                                            dataKey="rms"
                                            color={activeTab === 'LEFT' ? "#ef4444" : "#ec4899"}
                                            label="RMS Amplitude"
                                            domain={[0, 15]}
                                            height={200}
                                            isDark={isDark}
                                        />
                                    </div>
                                </div>
                            </div>
                        </>
                    )}

                </div>
            </div>
        </div >
    );
}
