import { PlayRoomContainer } from "../../../components/play/PlayRoomContainer";

type PlayRoomPageProps = {
  params: Promise<{
    roomId: string;
  }>;
};

export default async function PlayRoomPage({ params }: PlayRoomPageProps) {
  const resolvedParams = await params;

  return <PlayRoomContainer roomId={resolvedParams.roomId} />;
}
