import Nav from "../components/Nav";
import Replay from "../components/Replay";
import NoKeyNotice from "../components/NoKeyNotice";
import { hasBrowserKey } from "../components/maps";

export default function ReplayPage() {
  return (
    <div className="flex h-full flex-col">
      <Nav />
      {hasBrowserKey() ? <Replay /> : <NoKeyNotice />}
    </div>
  );
}
