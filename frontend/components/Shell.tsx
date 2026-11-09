import { Brand } from "@/components/StationNav";

/** The frame every station shares: the ODYSSEY header and a title strip. */
export function Shell({
  current,
  station,
  title,
  rag,
  children,
}: {
  current: string;
  station: string;
  title: string;
  rag: string;
  children: React.ReactNode;
}) {
  return (
    <div className="station" data-st={station}>
      <header className="top st-top">
        <Brand current={current} />
        <div className="st-title">
          <h1>{title}</h1>
          <p>{rag}</p>
        </div>
      </header>
      {children}
    </div>
  );
}
