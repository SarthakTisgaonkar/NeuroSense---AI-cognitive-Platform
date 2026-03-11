

// --- CUSTOM REALTIME CHART ---
const RealtimeChart = ({ data, dataKey, color, height = 150, label, domain, isDark }: any) => {
    if (!data || data.length < 2) return (
        <div className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg flex items-center justify-center text-slate-400 dark:text-slate-500 text-xs font-mono" style={{ height: `${height}px` }}>
            Waiting for data stream...
        </div>
    );
    // Dynamic Scaling: If data exceeds domain, stretch the chart to fit
    const maxDataVal = Math.max(...data.map((d: any) => d[dataKey])) || 0;
    const maxVal = domain ? Math.max(domain[1], maxDataVal) : maxDataVal * 1.2 || 1;
    const minVal = domain ? domain[0] : 0;
    const range = maxVal - minVal || 1;
    const getX = (i: number) => (i / (data.length - 1)) * 100;
    const getY = (v: number) => 100 - ((v - minVal) / range) * 100;
    const pathD = data.map((d: any, i: number) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(d[dataKey])}`).join(' ');

    return (
        <div className="w-full relative overflow-hidden" style={{ height: `${height}px` }}>
            <div className="absolute top-0 left-0 flex justify-between w-full px-2 pt-1 z-10">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{label}</span>
                <span className="text-[10px] font-mono text-slate-400">{data[data.length - 1][dataKey].toFixed(2)}</span>
            </div>
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full pt-5">
                <line x1="0" y1="25" x2="100" y2="25" className={isDark ? "stroke-slate-700" : "stroke-slate-200"} strokeWidth="0.5" strokeDasharray="2" />
                <line x1="0" y1="50" x2="100" y2="50" className={isDark ? "stroke-slate-700" : "stroke-slate-200"} strokeWidth="0.5" strokeDasharray="2" />
                <path d={pathD} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
                <path d={`${pathD} L 100 100 L 0 100 Z`} fill={color} fillOpacity="0.1" stroke="none" />
            </svg>
        </div>
    );
};

export default RealtimeChart;
