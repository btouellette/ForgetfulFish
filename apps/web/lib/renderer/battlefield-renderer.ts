import type { GameObjectView } from "@forgetful-fish/game-engine";

const cardWidth = 132;
const cardHeight = 184;
const cardGap = 24;
const slotWidth = cardHeight + cardGap;
const slotHeight = cardHeight + cardGap;

function labelController(controller: string, viewerPlayerId: string) {
  return controller === viewerPlayerId ? "You" : "Opponent";
}

export function renderBattlefield(
  ctx: CanvasRenderingContext2D,
  objects: GameObjectView[],
  width: number,
  height: number,
  viewerPlayerId: string
) {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#eef4f6";
  ctx.fillRect(0, 0, width, height);

  if (objects.length === 0) {
    ctx.fillStyle = "#334155";
    ctx.font = "20px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Battlefield empty", width / 2, height / 2);
    return;
  }

  const availableWidth = Math.max(slotWidth, width - 48);
  const columns = Math.max(1, Math.floor(availableWidth / slotWidth));
  const rows = Math.max(1, Math.ceil(objects.length / columns));
  const contentWidth = columns * slotWidth - cardGap;
  const contentHeight = rows * slotHeight - cardGap;
  const startX = Math.max(24, (width - contentWidth) / 2);
  const startY = Math.max(24, (height - contentHeight) / 2);

  for (const [index, object] of objects.entries()) {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const slotX = startX + column * slotWidth;
    const slotY = startY + row * slotHeight;
    const cardX = slotX + (slotWidth - cardWidth) / 2;
    const cardY = slotY + (slotHeight - cardHeight) / 2;

    ctx.save();

    if (object.tapped) {
      ctx.translate(cardX + cardWidth / 2, cardY + cardHeight / 2);
      ctx.rotate(Math.PI / 2);
      ctx.translate(-(cardWidth / 2), -(cardHeight / 2));
    } else {
      ctx.translate(cardX, cardY);
    }

    ctx.fillStyle = object.controller === viewerPlayerId ? "#dbeafe" : "#fee2e2";
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 2;
    ctx.fillRect(0, 0, cardWidth, cardHeight);
    ctx.strokeRect(0, 0, cardWidth, cardHeight);

    ctx.fillStyle = "#0f172a";
    ctx.font = "14px sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(object.cardDefId, 12, 12);
    ctx.fillText(labelController(object.controller, viewerPlayerId), 12, 34);
    if (object.tapped) {
      ctx.fillText("Tapped", 12, 56);
    }

    ctx.restore();
  }
}
