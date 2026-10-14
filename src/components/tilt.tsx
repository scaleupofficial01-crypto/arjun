/** Pure-CSS 3D tilt wrapper — zero JS/pointer handlers, can never block clicks. */
export default function Tilt({ children }: { children: React.ReactNode }) {
  return (
    <div className="tilt h-full">
      <div className="tilt-inner h-full">{children}</div>
    </div>
  );
}
