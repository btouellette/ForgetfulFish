import {
  expect,
  test,
  type APIRequestContext,
  type BrowserContext,
  type Page
} from "@playwright/test";

const serverBaseUrl = "http://127.0.0.1:4100";
const ownerToken = "owner-token";
const secondToken = "second-token";

type RealtimeControl = {
  blockConnections: boolean;
  trackedSockets: WebSocket[];
};

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

async function expectRoomLoaded(page: Page, seat: "P1" | "P2") {
  await expect(page.getByText(`Joined room`, { exact: false })).toBeVisible();
  await expect(page.getByText(`as seat ${seat}.`)).toBeVisible();
  await expect(page.getByText("Live connection: connected")).toBeVisible();
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

  try {
    await Promise.all([ownerPage.goto(`/play/${roomId}`), secondPage.goto(`/play/${roomId}`)]);

    await Promise.all([expectRoomLoaded(ownerPage, "P1"), expectRoomLoaded(secondPage, "P2")]);

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
    await Promise.all([expectRoomLoaded(ownerPage, "P1"), expectRoomLoaded(secondPage, "P2")]);

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
