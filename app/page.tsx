import Nav from "./components/Nav";
import LiveMap from "./components/LiveMap";
import NoKeyNotice from "./components/NoKeyNotice";
import { hasBrowserKey } from "./components/maps";

function Legend() {
  return (
    <div className="flex items-center gap-3 text-[11px] text-muted">
      <span className="flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-real" /> real
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-guessed" /> guessed
      </span>
    </div>
  );
}

export default function Home() {
  return (
    <div className="flex h-full flex-col">
      <Nav right={<Legend />} />
      {hasBrowserKey() ? <LiveMap /> : <NoKeyNotice />}
    </div>
  );
}
