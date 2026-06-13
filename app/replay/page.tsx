import Nav from "../components/Nav";
import Replay from "../components/Replay";
import NoKeyNotice from "../components/NoKeyNotice";
import { getMapsConfig } from "@/lib/maps-config";

export const dynamic = "force-dynamic";

export default function ReplayPage() {
  const { browserKey, mapId } = getMapsConfig();
  return (
    <div className="flex h-full flex-col">
      <Nav />
      {browserKey ? (
        <Replay browserKey={browserKey} mapId={mapId} />
      ) : (
        <NoKeyNotice />
      )}
    </div>
  );
}
