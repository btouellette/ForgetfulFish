import {
  expect,
  test,
  type APIRequestContext,
  type BrowserContext,
  type Locator,
  type Page
} from "@playwright/test";

const serverBaseUrl = "http://127.0.0.1:4100";
const ownerToken = "owner-token";
const secondToken = "second-token";
const DEBUG_BUFFER_LIMIT = 30;
const DIAGNOSTIC_READ_TIMEOUT_MS = 250;

type RealtimeControl = {
  blockConnections: boolean;
  trackedSockets: WebSocket[];
};

type PageDebugBuffers = {
  consoleEvents: string[];
  pageErrors: string[];
  requestFailures: string[];
};

type TestGameView = {
  stateVersion: number;
  viewer: {
    hand: Array<{ id: string; cardDefId: string }>;
  };
  objectPool: Record<string, { cardDefId: string }>;
  stack: Array<{ object: { id: string; zcc: number } }>;
  turnState: {
    activePlayerId: string;
    priorityPlayerId: string;
    phase:
      | "UNTAP"
      | "UPKEEP"
      | "DRAW"
      | "MAIN_1"
      | "BEGIN_COMBAT"
      | "DECLARE_ATTACKERS"
      | "DECLARE_BLOCKERS"
      | "COMBAT_DAMAGE"
      | "END_COMBAT"
      | "MAIN_2"
      | "END"
      | "CLEANUP";
  };
  pendingChoice: {
    id: string;
    forPlayer: string;
    type: "CHOOSE_CARDS" | "ORDER_CARDS" | "NAME_CARD" | "CHOOSE_YES_NO";
    constraints?: {
      candidates?: string[];
      cards?: string[];
      min?: number;
      max?: number;
    };
  } | null;
};

async function getGameViewForPlayer(request: APIRequestContext, roomId: string, token: string) {
  const response = await request.get(`${serverBaseUrl}/api/rooms/${roomId}/game`, {
    headers: {
      cookie: `authjs.session-token=${token}`
    }
  });

  expect(response.ok()).toBe(true);
  return (await response.json()) as TestGameView;
}

function getCardIdByDef(gameView: TestGameView, cardDefId: string) {
  const card = gameView.viewer.hand.find((entry) => entry.cardDefId === cardDefId);
  if (!card) {
    throw new Error(`expected '${cardDefId}' in hand`);
  }

  return card.id;
}

async function waitForStateChange(
  request: APIRequestContext,
  roomId: string,
  token: string,
  previousStateVersion: number
) {
  await expect
    .poll(async () => {
      const next = await getGameViewForPlayer(request, roomId, token);
      return next.stateVersion;
    })
    .toBeGreaterThan(previousStateVersion);
}

async function passPriorityForCurrentPriorityHolder(options: {
  ownerPage: Page;
  secondPage: Page;
  ownerGameView: TestGameView;
}) {
  const { ownerPage, secondPage, ownerGameView } = options;
  const passButton =
    ownerGameView.turnState.priorityPlayerId === "owner-1"
      ? ownerPage.getByRole("button", { name: "Pass priority" })
      : secondPage.getByRole("button", { name: "Pass priority" });

  await passButton.click();
}

async function advanceUntil(
  request: APIRequestContext,
  roomId: string,
  ownerPage: Page,
  secondPage: Page,
  predicate: (ownerGameView: TestGameView, secondGameView: TestGameView) => boolean,
  maxPasses = 120
) {
  for (let index = 0; index < maxPasses; index += 1) {
    const ownerGameView = await getGameViewForPlayer(request, roomId, ownerToken);
    const secondGameView = await getGameViewForPlayer(request, roomId, secondToken);

    if (predicate(ownerGameView, secondGameView)) {
      return {
        ownerGameView,
        secondGameView
      };
    }

    const previousStateVersion = ownerGameView.stateVersion;
    await passPriorityForCurrentPriorityHolder({ ownerPage, secondPage, ownerGameView });
    await waitForStateChange(request, roomId, ownerToken, previousStateVersion);
  }

  throw new Error("failed to reach expected gameplay state before max passes");
}

function pushDebugLine(lines: string[], nextLine: string) {
  lines.push(nextLine);

  if (lines.length > DEBUG_BUFFER_LIMIT) {
    lines.shift();
  }
}

async function readTextOrNull(locator: Locator) {
  return locator.textContent({
    timeout: DIAGNOSTIC_READ_TIMEOUT_MS
  });
}

function attachPageDebugBuffers(page: Page, label: string): PageDebugBuffers {
  const buffers: PageDebugBuffers = {
    consoleEvents: [],
    pageErrors: [],
    requestFailures: []
  };

  page.on("console", (message) => {
    const messageType = message.type();

    if (messageType !== "error" && messageType !== "warning") {
      return;
    }

    pushDebugLine(buffers.consoleEvents, `[${label}] console.${messageType}: ${message.text()}`);
  });

  page.on("pageerror", (error) => {
    pushDebugLine(buffers.pageErrors, `[${label}] pageerror: ${error.message}`);
  });

  page.on("requestfailed", (request) => {
    const failure = request.failure();
    const failureText = failure?.errorText ?? "unknown";
    pushDebugLine(
      buffers.requestFailures,
      `[${label}] requestfailed ${request.method()} ${request.url()} -> ${failureText}`
    );
  });

  return buffers;
}

async function installRealtimeControl(context: BrowserContext) {
  await context.addInitScript(() => {
    const originalWebSocket = window.WebSocket;
    const isRoomSocketUrl = (url: string) => url.includes("/ws/rooms/");
    const controlWindow = window as Window & {
      __ffRealtimeControl?: RealtimeControl;
    };

    controlWindow.__ffRealtimeControl = {
      blockConnections: false,
      trackedSockets: []
    };

    class ControlledWebSocket extends originalWebSocket {
      constructor(url: string | URL, protocols?: string | string[]) {
        const urlText = typeof url === "string" ? url : url.toString();
        const isRoomSocket = isRoomSocketUrl(urlText);

        super(url, protocols);

        if (isRoomSocket) {
          controlWindow.__ffRealtimeControl?.trackedSockets.push(this);
        }

        this.addEventListener("open", () => {
          const shouldBlock = controlWindow.__ffRealtimeControl?.blockConnections;

          if (shouldBlock && isRoomSocket) {
            this.close();
          }
        });
      }
    }

    window.WebSocket = ControlledWebSocket;
  });
}

async function addSessionCookie(context: BrowserContext, sessionToken: string) {
  await context.addCookies([
    {
      name: "authjs.session-token",
      value: sessionToken,
      domain: "127.0.0.1",
      path: "/",
      httpOnly: true,
      sameSite: "Lax"
    }
  ]);
}

async function createRoom(request: APIRequestContext) {
  const response = await request.post(`${serverBaseUrl}/api/rooms`, {
    headers: {
      cookie: `authjs.session-token=${ownerToken}`
    }
  });

  expect(response.ok()).toBe(true);

  const payload = (await response.json()) as { roomId: string };
  return payload.roomId;
}

function extractGameId(gameText: string | null) {
  if (!gameText) {
    throw new Error("expected game status text");
  }

  const matched = /Game: started \(([^)]+)\)/.exec(gameText);

  if (!matched || !matched[1]) {
    throw new Error(`failed to parse game id from: ${gameText}`);
  }

  return matched[1];
}

async function expectRoomLoaded(page: Page, seat: "P1" | "P2", debugBuffers?: PageDebugBuffers) {
  try {
    await expect(page.getByText("Joined room", { exact: false })).toBeVisible();
    await expect(page.getByText(`as seat ${seat}.`)).toBeVisible();
    await expect(page.getByText("Live connection: connected")).toBeVisible();
  } catch (error) {
    const [heading, roomLine, gameLine, connectionLine, paragraphs] = await Promise.all([
      readTextOrNull(page.locator("h1").first()).catch(() => null),
      readTextOrNull(page.getByText(/Room:/).first()).catch(() => null),
      readTextOrNull(page.getByText(/Game:/).first()).catch(() => null),
      readTextOrNull(page.getByText(/Live connection:/).first()).catch(() => null),
      page
        .locator("p")
        .allTextContents()
        .catch(() => [])
    ]);

    const diagnostics = {
      url: page.url(),
      heading,
      roomLine,
      gameLine,
      connectionLine,
      paragraphs,
      consoleEvents: debugBuffers?.consoleEvents ?? [],
      pageErrors: debugBuffers?.pageErrors ?? [],
      requestFailures: debugBuffers?.requestFailures ?? [],
      originalError: error instanceof Error ? error.message : String(error)
    };

    const diagnosticError = new Error(
      `room did not reach joined state for seat ${seat}\n${JSON.stringify(diagnostics, null, 2)}`
    ) as Error & { cause?: unknown };
    diagnosticError.cause = error;
    throw diagnosticError;
  }
}

test("syncs ready updates and game start across two browser clients", async ({
  browser,
  request
}) => {
  const roomId = await createRoom(request);

  const ownerContext = await browser.newContext();
  const secondContext = await browser.newContext();

  await Promise.all([
    addSessionCookie(ownerContext, ownerToken),
    addSessionCookie(secondContext, secondToken)
  ]);

  const ownerPage = await ownerContext.newPage();
  const secondPage = await secondContext.newPage();
  const ownerDebugBuffers = attachPageDebugBuffers(ownerPage, "owner");
  const secondDebugBuffers = attachPageDebugBuffers(secondPage, "second");

  try {
    await Promise.all([ownerPage.goto(`/play/${roomId}`), secondPage.goto(`/play/${roomId}`)]);

    await Promise.all([
      expectRoomLoaded(ownerPage, "P1", ownerDebugBuffers),
      expectRoomLoaded(secondPage, "P2", secondDebugBuffers)
    ]);

    await ownerPage.getByRole("button", { name: "Mark ready" }).click();
    await expect(ownerPage.getByText("P1: owner-1 (ready)")).toBeVisible();
    await expect(secondPage.getByText("P1: owner-1 (ready)")).toBeVisible();

    await secondPage.getByRole("button", { name: "Mark ready" }).click();
    await expect(ownerPage.getByText("P2: player-2 (ready)")).toBeVisible();

    const startButton = ownerPage.getByRole("button", { name: "Start game" });
    await expect(startButton).toBeEnabled();
    await startButton.click();

    const ownerGameText = ownerPage.getByText(/Game: started \(/);
    const secondGameText = secondPage.getByText(/Game: started \(/);

    await expect(ownerGameText).toBeVisible();
    await expect(secondGameText).toBeVisible();

    const ownerGameId = extractGameId(await ownerGameText.textContent());
    const secondGameId = extractGameId(await secondGameText.textContent());

    expect(ownerGameId).toBe(secondGameId);
  } finally {
    await Promise.all([ownerContext.close(), secondContext.close()]);
  }
});

test("resyncs canonical lobby state after reconnect", async ({ browser, request }) => {
  const roomId = await createRoom(request);

  const ownerContext = await browser.newContext();
  const secondContext = await browser.newContext();

  await installRealtimeControl(ownerContext);

  await Promise.all([
    addSessionCookie(ownerContext, ownerToken),
    addSessionCookie(secondContext, secondToken)
  ]);

  const ownerPage = await ownerContext.newPage();
  const secondPage = await secondContext.newPage();
  const ownerDebugBuffers = attachPageDebugBuffers(ownerPage, "owner");
  const secondDebugBuffers = attachPageDebugBuffers(secondPage, "second");
  let blockLobbyPollRequests = false;

  try {
    await ownerPage.route(`**/api/rooms/${roomId}`, async (route, request) => {
      if (request.method() === "GET" && blockLobbyPollRequests) {
        await route.abort("failed");
        return;
      }

      await route.continue();
    });

    await Promise.all([ownerPage.goto(`/play/${roomId}`), secondPage.goto(`/play/${roomId}`)]);
    await Promise.all([
      expectRoomLoaded(ownerPage, "P1", ownerDebugBuffers),
      expectRoomLoaded(secondPage, "P2", secondDebugBuffers)
    ]);

    blockLobbyPollRequests = true;

    await ownerPage.evaluate(() => {
      const controlWindow = window as Window & {
        __ffRealtimeControl?: RealtimeControl;
      };
      const control = controlWindow.__ffRealtimeControl;

      if (!control) {
        throw new Error("missing realtime control");
      }

      control.blockConnections = true;

      for (const socket of control.trackedSockets) {
        if (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN) {
          socket.close();
        }
      }
    });

    await expect(ownerPage.getByText(/Live connection: (reconnecting|offline)/)).toBeVisible();
    await expect(ownerPage.getByText(/Live sync is/)).toBeVisible();

    await secondPage.getByRole("button", { name: "Mark ready" }).click();
    await expect(secondPage.getByText("P2: player-2 (ready)")).toBeVisible();
    await expect(ownerPage.getByText("P2: player-2 (not ready)")).toBeVisible();

    await ownerPage.evaluate(() => {
      const controlWindow = window as Window & {
        __ffRealtimeControl?: RealtimeControl;
      };

      if (!controlWindow.__ffRealtimeControl) {
        throw new Error("missing realtime control");
      }

      controlWindow.__ffRealtimeControl.blockConnections = false;
    });
    blockLobbyPollRequests = false;

    await expect(ownerPage.getByText("Live connection: connected")).toBeVisible({
      timeout: 20_000
    });
    await expect(ownerPage.getByText("P2: player-2 (ready)")).toBeVisible();
  } finally {
    await Promise.all([ownerContext.close(), secondContext.close()]);
  }
});

test("covers current-card gameplay interactions from browser clients", async ({
  browser,
  request
}) => {
  test.setTimeout(180_000);

  const roomId = await createRoom(request);
  const ownerContext = await browser.newContext();
  const secondContext = await browser.newContext();

  await Promise.all([
    addSessionCookie(ownerContext, ownerToken),
    addSessionCookie(secondContext, secondToken)
  ]);

  const ownerPage = await ownerContext.newPage();
  const secondPage = await secondContext.newPage();

  try {
    await Promise.all([ownerPage.goto(`/play/${roomId}`), secondPage.goto(`/play/${roomId}`)]);
    await Promise.all([expectRoomLoaded(ownerPage, "P1"), expectRoomLoaded(secondPage, "P2")]);

    await ownerPage.getByRole("button", { name: "Mark ready" }).click();
    await secondPage.getByRole("button", { name: "Mark ready" }).click();
    await ownerPage.getByRole("button", { name: "Start game" }).click();
    await Promise.all([
      expect(ownerPage.getByText(/Game: started \(/)).toBeVisible(),
      expect(secondPage.getByText(/Game: started \(/)).toBeVisible()
    ]);

    const openingTurn = await advanceUntil(
      request,
      roomId,
      ownerPage,
      secondPage,
      (owner) => owner.turnState.activePlayerId === "owner-1" && owner.turnState.phase === "MAIN_1"
    );
    const openingOwner = openingTurn.ownerGameView;
    const openingSecond = openingTurn.secondGameView;

    expect(openingOwner.viewer.hand.some((card) => card.cardDefId === "brainstorm")).toBe(true);
    expect(openingOwner.viewer.hand.some((card) => card.cardDefId === "memory-lapse")).toBe(true);
    expect(
      openingOwner.viewer.hand.some((card) => card.cardDefId === "accumulated-knowledge")
    ).toBe(true);
    expect(openingSecond.viewer.hand.some((card) => card.cardDefId === "predict")).toBe(true);
    expect(openingSecond.viewer.hand.some((card) => card.cardDefId === "mystical-tutor")).toBe(
      true
    );
    expect(
      openingSecond.viewer.hand.some((card) => card.cardDefId === "accumulated-knowledge")
    ).toBe(true);

    const ownerIslandId = getCardIdByDef(openingOwner, "island");
    const prePlayLandVersion = openingOwner.stateVersion;
    await ownerPage.locator(`[data-testid="play-land-${ownerIslandId}"]`).click();
    await waitForStateChange(request, roomId, ownerToken, prePlayLandVersion);

    let ownerGameView = await getGameViewForPlayer(request, roomId, ownerToken);
    const brainstormId = getCardIdByDef(ownerGameView, "brainstorm");
    const preBrainstormCastVersion = ownerGameView.stateVersion;
    await ownerPage.locator(`[data-testid="cast-spell-${brainstormId}"]`).click();
    await waitForStateChange(request, roomId, ownerToken, preBrainstormCastVersion);

    const chooseCardsState = await advanceUntil(
      request,
      roomId,
      ownerPage,
      secondPage,
      (owner) => owner.pendingChoice?.type === "CHOOSE_CARDS"
    );
    ownerGameView = chooseCardsState.ownerGameView;
    const chooseCardsConstraints = ownerGameView.pendingChoice?.constraints;
    const chooseCandidates = chooseCardsConstraints?.candidates ?? [];
    const chooseMin = chooseCardsConstraints?.min ?? 0;
    const cardsToPutBack = chooseCandidates
      .filter((candidateId) => ownerGameView.objectPool[candidateId]?.cardDefId === "island")
      .slice(0, chooseMin);

    expect(cardsToPutBack).toHaveLength(chooseMin);

    for (const candidateId of cardsToPutBack) {
      await ownerPage.locator(`[data-testid="choose-card-${candidateId}"]`).click();
    }
    await ownerPage.locator('[data-testid="choose-cards-submit"]').click();
    await waitForStateChange(request, roomId, ownerToken, ownerGameView.stateVersion);

    ownerGameView = await getGameViewForPlayer(request, roomId, ownerToken);
    expect(ownerGameView.pendingChoice?.type).toBe("ORDER_CARDS");
    const orderCards = ownerGameView.pendingChoice?.constraints?.cards ?? [];
    if (orderCards.length > 1) {
      await ownerPage.locator(`[data-testid="order-down-${orderCards[0]}"]`).click();
    }
    await ownerPage.locator('[data-testid="order-cards-submit"]').click();
    await waitForStateChange(request, roomId, ownerToken, ownerGameView.stateVersion);

    const mysticalTurn = await advanceUntil(
      request,
      roomId,
      ownerPage,
      secondPage,
      (owner, second) =>
        owner.turnState.activePlayerId === "player-2" &&
        owner.turnState.phase === "MAIN_1" &&
        second.viewer.hand.some((card) => card.cardDefId === "mystical-tutor")
    );

    const secondIslandId = getCardIdByDef(mysticalTurn.secondGameView, "island");
    await secondPage.locator(`[data-testid="play-land-${secondIslandId}"]`).click();
    await waitForStateChange(request, roomId, ownerToken, mysticalTurn.ownerGameView.stateVersion);

    const secondAfterLand = await getGameViewForPlayer(request, roomId, secondToken);
    const mysticalTutorId = getCardIdByDef(secondAfterLand, "mystical-tutor");
    await secondPage.locator(`[data-testid="cast-spell-${mysticalTutorId}"]`).click();
    await waitForStateChange(request, roomId, ownerToken, secondAfterLand.stateVersion);

    const optionalChooseCardsState = await advanceUntil(
      request,
      roomId,
      ownerPage,
      secondPage,
      (_owner, second) => second.pendingChoice?.type === "CHOOSE_CARDS"
    );

    await secondPage.locator('[data-testid="choose-cards-submit"]').click();
    await waitForStateChange(
      request,
      roomId,
      ownerToken,
      optionalChooseCardsState.ownerGameView.stateVersion
    );

    const predictTurn = await advanceUntil(
      request,
      roomId,
      ownerPage,
      secondPage,
      (owner, second) =>
        owner.turnState.activePlayerId === "player-2" &&
        owner.turnState.phase === "MAIN_1" &&
        second.viewer.hand.some((card) => card.cardDefId === "predict") &&
        second.viewer.hand.some((card) => card.cardDefId === "island")
    );

    const secondBeforePredict = await getGameViewForPlayer(request, roomId, secondToken);
    const predictId = getCardIdByDef(secondBeforePredict, "predict");
    await secondPage.locator(`[data-testid="cast-spell-${predictId}"]`).click();
    await waitForStateChange(request, roomId, ownerToken, secondBeforePredict.stateVersion);

    const nameCardState = await advanceUntil(
      request,
      roomId,
      ownerPage,
      secondPage,
      (_owner, second) => second.pendingChoice?.type === "NAME_CARD"
    );

    await secondPage.locator('[data-testid="name-card-input"]').fill("island");
    await secondPage.locator('[data-testid="name-card-submit"]').click();
    await waitForStateChange(request, roomId, ownerToken, nameCardState.ownerGameView.stateVersion);

    const memoryLapseTurn = await advanceUntil(
      request,
      roomId,
      ownerPage,
      secondPage,
      (owner, second) =>
        owner.turnState.activePlayerId === "player-2" &&
        owner.turnState.phase === "MAIN_1" &&
        second.viewer.hand.some((card) => card.cardDefId === "accumulated-knowledge") &&
        second.viewer.hand.some((card) => card.cardDefId === "island") &&
        owner.viewer.hand.some((card) => card.cardDefId === "memory-lapse")
    );

    const secondBeforeAk = await getGameViewForPlayer(request, roomId, secondToken);
    const opponentAkId = getCardIdByDef(secondBeforeAk, "accumulated-knowledge");
    await secondPage.locator(`[data-testid="cast-spell-${opponentAkId}"]`).click();
    await waitForStateChange(request, roomId, ownerToken, secondBeforeAk.stateVersion);

    const memoryLapseResponseWindow = await advanceUntil(
      request,
      roomId,
      ownerPage,
      secondPage,
      (owner) =>
        owner.turnState.activePlayerId === "player-2" &&
        owner.turnState.priorityPlayerId === "owner-1" &&
        owner.stack.length > 0
    );

    const ownerBeforeMemoryLapse = memoryLapseResponseWindow.ownerGameView;
    const memoryLapseId = getCardIdByDef(ownerBeforeMemoryLapse, "memory-lapse");
    const stackObjectId = ownerBeforeMemoryLapse.stack[0]?.object.id;
    if (!stackObjectId) {
      throw new Error("expected a stack object for memory lapse targeting");
    }

    await ownerPage.locator(`[data-testid="cast-spell-targeted-${memoryLapseId}"]`).click();
    await ownerPage.locator(`[data-testid="stack-target-${stackObjectId}"]`).click();
    await waitForStateChange(request, roomId, ownerToken, ownerBeforeMemoryLapse.stateVersion);

    const ownerAccumulatedKnowledgeTurn = await advanceUntil(
      request,
      roomId,
      ownerPage,
      secondPage,
      (owner) =>
        owner.turnState.activePlayerId === "owner-1" &&
        owner.turnState.phase === "MAIN_1" &&
        owner.viewer.hand.some((card) => card.cardDefId === "accumulated-knowledge")
    );

    const ownerBeforeAk = ownerAccumulatedKnowledgeTurn.ownerGameView;
    const ownerAkId = getCardIdByDef(ownerBeforeAk, "accumulated-knowledge");
    await ownerPage.locator(`[data-testid="cast-spell-${ownerAkId}"]`).click();
    await waitForStateChange(request, roomId, ownerToken, ownerBeforeAk.stateVersion);

    const preResolveVersion = (await getGameViewForPlayer(request, roomId, ownerToken))
      .stateVersion;
    const ownerAfterAk = await advanceUntil(
      request,
      roomId,
      ownerPage,
      secondPage,
      (owner) => owner.stack.length === 0 && owner.stateVersion > preResolveVersion
    );

    expect(ownerAfterAk.ownerGameView.viewer.hand.length).toBe(ownerBeforeAk.viewer.hand.length);
  } finally {
    await Promise.all([ownerContext.close(), secondContext.close()]);
  }
});
