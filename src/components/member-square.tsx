import { initial, memberColor } from "@/lib/whiteboard";

/**
 * 担当者アイコン。積み木の面に載っているものと同じ形・同じ色を、
 * 一覧や設定でも使う(色 = 人、という約束を画面間で崩さないため)。
 */
export function MemberSquare({
  id,
  name,
  size = 22,
}: {
  id: string | null;
  name?: string | null;
  size?: number;
}) {
  const color = memberColor(id);
  return (
    <span
      className="brick grid shrink-0 place-items-center rounded-[6px] font-bold text-white"
      style={
        {
          width: size,
          height: size,
          background: color,
          fontSize: size * 0.42,
          "--depth-x": "0px",
          "--depth-y": "2px",
          "--depth-color": `color-mix(in srgb, ${color} 74%, #000)`,
        } as React.CSSProperties
      }
      title={name ?? undefined}
      aria-hidden
    >
      {name ? initial(name) : ""}
    </span>
  );
}
