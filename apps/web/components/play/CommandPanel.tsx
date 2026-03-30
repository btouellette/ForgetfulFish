import React from "react";
import type {
  GameplayCommand,
  GameplayPendingChoice,
  PlayerGameView
} from "@forgetful-fish/realtime-contract";

import { shouldAutoPass } from "../../lib/auto-pass";
import { parsePendingChoice } from "../../lib/pending-choice";
import { buildDisambiguatedObjectLabels } from "./cardLabels";

import styles from "./CommandPanel.module.css";

type MakeChoicePayload = Extract<GameplayCommand, { type: "MAKE_CHOICE" }>["payload"];

type CommandPanelProps = {
  viewerPlayerId: string;
  gameView?: PlayerGameView | null;
  pendingChoice: GameplayPendingChoice | null;
  viewerHasPriority: boolean;
  isSubmitting: boolean;
  error: string | null;
  autoPassEnabled: boolean;
  onAutoPassEnabledChange: (enabled: boolean) => void;
  onPassPriority: () => void;
  onConcede: () => void;
  onMakeChoice: (payload: MakeChoicePayload) => void;
  onClearError: () => void;
};

export function CommandPanel({
  viewerPlayerId,
  gameView,
  pendingChoice,
  viewerHasPriority,
  isSubmitting,
  error,
  autoPassEnabled,
  onAutoPassEnabledChange,
  onPassPriority,
  onConcede,
  onMakeChoice,
  onClearError
}: CommandPanelProps) {
  const parsedPendingChoice = pendingChoice ? parsePendingChoice(pendingChoice) : null;
  const isPendingChoiceForViewer =
    pendingChoice !== null && pendingChoice.forPlayer === viewerPlayerId;
  const chooseCardsConstraints =
    parsedPendingChoice?.kind === "choose_cards" ? parsedPendingChoice.constraints : null;
  const orderCardsConstraints =
    parsedPendingChoice?.kind === "order_cards" ? parsedPendingChoice.constraints : null;
  const [selectedCardIds, setSelectedCardIds] = React.useState<string[]>([]);
  const [namedCard, setNamedCard] = React.useState("");
  const [orderedCardIds, setOrderedCardIds] = React.useState<string[]>([]);
  const initializedChoiceIdRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    const nextChoiceId = pendingChoice?.id ?? null;
    if (initializedChoiceIdRef.current === nextChoiceId) {
      return;
    }

    initializedChoiceIdRef.current = nextChoiceId;
    setSelectedCardIds([]);
    setNamedCard("");
    setOrderedCardIds(orderCardsConstraints?.cards ?? []);
  }, [pendingChoice?.id, orderCardsConstraints?.cards]);

  const canSubmitChooseCards =
    chooseCardsConstraints !== null &&
    selectedCardIds.length >= chooseCardsConstraints.min &&
    selectedCardIds.length <= chooseCardsConstraints.max;
  const trimmedNamedCard = namedCard.trim();
  const canSubmitNameCard = trimmedNamedCard.length > 0;
  const chooseCardLabels = React.useMemo(
    () =>
      buildDisambiguatedObjectLabels(
        chooseCardsConstraints?.candidates ?? [],
        gameView?.objectPool ?? {}
      ),
    [chooseCardsConstraints?.candidates, gameView?.objectPool]
  );
  const orderedCardLabels = React.useMemo(
    () =>
      buildDisambiguatedObjectLabels(
        orderCardsConstraints?.cards ?? orderedCardIds,
        gameView?.objectPool ?? {}
      ),
    [gameView?.objectPool, orderCardsConstraints?.cards, orderedCardIds]
  );

  function toggleSelectedCard(cardId: string) {
    if (chooseCardsConstraints === null) {
      return;
    }

    setSelectedCardIds((currentSelected) => {
      if (currentSelected.includes(cardId)) {
        return currentSelected.filter((selectedId) => selectedId !== cardId);
      }

      if (currentSelected.length >= chooseCardsConstraints.max) {
        return currentSelected;
      }

      return [...currentSelected, cardId];
    });
  }

  function moveOrderedCard(cardId: string, direction: -1 | 1) {
    setOrderedCardIds((currentOrderedCards) => {
      const currentIndex = currentOrderedCards.indexOf(cardId);
      if (currentIndex < 0) {
        return currentOrderedCards;
      }

      const nextIndex = currentIndex + direction;
      if (nextIndex < 0 || nextIndex >= currentOrderedCards.length) {
        return currentOrderedCards;
      }

      const nextOrderedCards = [...currentOrderedCards];
      const [movingCard] = nextOrderedCards.splice(currentIndex, 1);
      if (movingCard === undefined) {
        return currentOrderedCards;
      }
      nextOrderedCards.splice(nextIndex, 0, movingCard);
      return nextOrderedCards;
    });
  }

  function handleConcede() {
    if (typeof window === "undefined") {
      onConcede();
      return;
    }

    if (window.confirm("Concede the game?")) {
      onConcede();
    }
  }

  function handlePassPriority() {
    if (!viewerHasPriority || isSubmitting) {
      return;
    }

    onPassPriority();
  }

  let autoPassHint: string | null = null;
  if (autoPassEnabled) {
    if (!gameView) {
      autoPassHint = "Auto-pass is enabled and waiting for the next visible game state.";
    } else if (pendingChoice !== null) {
      autoPassHint = "Auto-pass is enabled but waiting for the current choice to finish.";
    } else if (!viewerHasPriority) {
      autoPassHint = "Auto-pass is enabled and waiting until you regain priority.";
    } else if (isSubmitting) {
      autoPassHint = "Auto-pass is enabled but waiting for the current action to finish.";
    } else if (shouldAutoPass(gameView)) {
      autoPassHint = "Auto-pass will pass priority automatically on this state.";
    } else {
      autoPassHint = "Auto-pass is holding because you have an apparent action available.";
    }
  }

  return (
    <section className={styles.commandPanel}>
      <h3>Commands</h3>
      {error ? (
        <div className={styles.errorBanner}>
          <span>{error}</span>
          <button type="button" onClick={onClearError}>
            Dismiss
          </button>
        </div>
      ) : null}
      {pendingChoice ? (
        <div className={styles.choiceCard}>
          <strong>Pending choice</strong>
          <span>{pendingChoice.prompt}</span>
          {!isPendingChoiceForViewer ? (
            <span>Waiting for opponent choice.</span>
          ) : parsedPendingChoice?.kind === "yes_no" ? (
            <div className={styles.actionRow}>
              <button
                type="button"
                onClick={() => onMakeChoice({ type: "CHOOSE_YES_NO", accepted: true })}
                disabled={isSubmitting}
              >
                Yes
              </button>
              <button
                type="button"
                onClick={() => onMakeChoice({ type: "CHOOSE_YES_NO", accepted: false })}
                disabled={isSubmitting}
              >
                No
              </button>
            </div>
          ) : parsedPendingChoice?.kind === "choose_cards" ? (
            <div className={styles.choiceColumn}>
              <span>
                Select {chooseCardsConstraints?.min} to {chooseCardsConstraints?.max} cards.
              </span>
              <div className={styles.choiceList}>
                {chooseCardsConstraints?.candidates.map((candidateId) => {
                  const isSelected = selectedCardIds.includes(candidateId);
                  const isMaxedOut =
                    chooseCardsConstraints !== null &&
                    selectedCardIds.length >= chooseCardsConstraints.max;
                  const label = chooseCardLabels[candidateId] ?? candidateId;

                  return (
                    <label key={candidateId} className={styles.choiceOption}>
                      <input
                        type="checkbox"
                        data-testid={`choose-card-${candidateId}`}
                        checked={isSelected}
                        onChange={() => toggleSelectedCard(candidateId)}
                        disabled={isSubmitting || (!isSelected && isMaxedOut)}
                      />
                      <span>{label}</span>
                    </label>
                  );
                })}
              </div>
              <button
                type="button"
                data-testid="choose-cards-submit"
                onClick={() =>
                  onMakeChoice({
                    type: "CHOOSE_CARDS",
                    selected: selectedCardIds,
                    min: chooseCardsConstraints?.min ?? 0,
                    max: chooseCardsConstraints?.max ?? 0
                  })
                }
                disabled={isSubmitting || !canSubmitChooseCards}
              >
                Submit selection
              </button>
            </div>
          ) : parsedPendingChoice?.kind === "name_card" ? (
            <div className={styles.choiceColumn}>
              <label htmlFor="name-card-input">Card name</label>
              <input
                id="name-card-input"
                type="text"
                value={namedCard}
                onInput={(event) => setNamedCard(event.currentTarget.value)}
                data-testid="name-card-input"
                disabled={isSubmitting}
              />
              <button
                type="button"
                data-testid="name-card-submit"
                onClick={() =>
                  onMakeChoice({
                    type: "NAME_CARD",
                    cardName: trimmedNamedCard
                  })
                }
                disabled={isSubmitting || !canSubmitNameCard}
              >
                Submit name
              </button>
            </div>
          ) : parsedPendingChoice?.kind === "order_cards" ? (
            <div className={styles.choiceColumn}>
              <span>Set the return order (top card first).</span>
              <div className={styles.choiceList}>
                {orderedCardIds.map((cardId, index) => {
                  const lastIndex = orderedCardIds.length - 1;
                  const label = orderedCardLabels[cardId] ?? cardId;
                  return (
                    <div key={cardId} className={styles.orderRow}>
                      <span data-testid={`order-label-${cardId}`}>{label}</span>
                      <div className={styles.actionRow}>
                        <button
                          type="button"
                          data-testid={`order-up-${cardId}`}
                          onClick={() => moveOrderedCard(cardId, -1)}
                          disabled={isSubmitting || index === 0}
                        >
                          Up
                        </button>
                        <button
                          type="button"
                          data-testid={`order-down-${cardId}`}
                          onClick={() => moveOrderedCard(cardId, 1)}
                          disabled={isSubmitting || index === lastIndex}
                        >
                          Down
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
              <button
                type="button"
                data-testid="order-cards-submit"
                onClick={() =>
                  onMakeChoice({
                    type: "ORDER_CARDS",
                    ordered: orderedCardIds
                  })
                }
                disabled={isSubmitting || orderedCardIds.length === 0}
              >
                Submit order
              </button>
            </div>
          ) : parsedPendingChoice?.kind === "invalid" ? (
            <span>Choice payload is invalid. Waiting for refresh.</span>
          ) : (
            <span>Waiting for a supported choice action.</span>
          )}
        </div>
      ) : null}
      <label className={styles.choiceOption}>
        <input
          type="checkbox"
          data-testid="auto-pass-checkbox"
          checked={autoPassEnabled}
          onChange={(event) => onAutoPassEnabledChange(event.currentTarget.checked)}
        />
        <span>
          Auto-pass priority when no apparent actions
          {gameView ? ` (state ${gameView.stateVersion})` : ""}
        </span>
      </label>
      {autoPassHint ? <p className={styles.autoPassHint}>{autoPassHint}</p> : null}
      <div className={styles.actionRow}>
        <button
          type="button"
          onClick={handlePassPriority}
          disabled={isSubmitting || !viewerHasPriority}
        >
          Pass priority
        </button>
        <button
          type="button"
          className={styles.dangerButton}
          onClick={handleConcede}
          disabled={isSubmitting}
        >
          Concede game
        </button>
      </div>
    </section>
  );
}
