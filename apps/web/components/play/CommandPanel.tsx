import React from "react";
import type { GameplayCommand, GameplayPendingChoice } from "@forgetful-fish/realtime-contract";

import { parsePendingChoice } from "../../lib/pending-choice";

import styles from "./CommandPanel.module.css";

type MakeChoicePayload = Extract<GameplayCommand, { type: "MAKE_CHOICE" }>["payload"];

type CommandPanelProps = {
  viewerPlayerId: string;
  pendingChoice: GameplayPendingChoice | null;
  isSubmitting: boolean;
  error: string | null;
  onPassPriority: () => void;
  onConcede: () => void;
  onMakeChoice: (payload: MakeChoicePayload) => void;
  onClearError: () => void;
};

export function CommandPanel({
  viewerPlayerId,
  pendingChoice,
  isSubmitting,
  error,
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
  const [selectedCardIds, setSelectedCardIds] = React.useState<string[]>([]);
  const [namedCard, setNamedCard] = React.useState("");

  React.useEffect(() => {
    setSelectedCardIds([]);
    setNamedCard("");
  }, [pendingChoice?.id]);

  const canSubmitChooseCards =
    chooseCardsConstraints !== null &&
    selectedCardIds.length >= chooseCardsConstraints.min &&
    selectedCardIds.length <= chooseCardsConstraints.max;
  const trimmedNamedCard = namedCard.trim();
  const canSubmitNameCard = trimmedNamedCard.length > 0;

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

  function handleConcede() {
    if (typeof window === "undefined") {
      onConcede();
      return;
    }

    if (window.confirm("Concede the game?")) {
      onConcede();
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

                  return (
                    <label key={candidateId} className={styles.choiceOption}>
                      <input
                        type="checkbox"
                        data-testid={`choose-card-${candidateId}`}
                        checked={isSelected}
                        onChange={() => toggleSelectedCard(candidateId)}
                        disabled={isSubmitting || (!isSelected && isMaxedOut)}
                      />
                      <span>{candidateId}</span>
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
          ) : parsedPendingChoice?.kind === "invalid" ? (
            <span>Choice payload is invalid. Waiting for refresh.</span>
          ) : (
            <span>Waiting for a supported choice action.</span>
          )}
        </div>
      ) : null}
      <div className={styles.actionRow}>
        <button type="button" onClick={onPassPriority} disabled={isSubmitting}>
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
