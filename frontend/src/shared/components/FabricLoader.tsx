import fabricLogo from '../styles/fabric_28_color.png';

export const FabricLoader = () => (
  <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white">
    <div className="flex flex-col items-center gap-6">
      <div className="relative">
        <img
          src={fabricLogo}
          alt="Fabric"
          className="w-16 h-16 object-contain animate-fabric-pulse"
        />
      </div>
      <div className="flex items-center gap-1.5">
        <div className="w-1.5 h-1.5 rounded-full bg-forest-500 animate-bounce [animation-delay:0ms]" />
        <div className="w-1.5 h-1.5 rounded-full bg-forest-500 animate-bounce [animation-delay:150ms]" />
        <div className="w-1.5 h-1.5 rounded-full bg-forest-500 animate-bounce [animation-delay:300ms]" />
      </div>
      <p className="text-sm font-semibold text-zinc-400 tracking-wide">Signing you in…</p>
    </div>
  </div>
);
