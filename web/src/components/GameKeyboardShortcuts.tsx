import { useEffect } from 'react';
import { useGameStore } from '../store/gameStore';
import { useMenuStore } from '../store/menuStore';
import { useTutorialStore } from '../store/tutorialStore';
import { useShortcutHelpStore } from '../store/shortcutHelpStore';
import { useCardInspectStore } from '../store/cardInspectStore';

const DIGIT_SHORTCUT_CODES = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5'] as const;
const NUMPAD_SHORTCUT_CODES = ['Numpad1', 'Numpad2', 'Numpad3', 'Numpad4', 'Numpad5'] as const;
const BOARD_DISPLAY_TO_INDEX = [4, 3, 2, 1, 0] as const;

export const GAME_SHORTCUTS = {
  bag: 'B',
  details: 'D',
  inspect: 'I',
  tutorial: 'T',
  help: '?',
  menu: 'M',
  commit: 'C',
  undo: 'Z',
  burn: 'X',
  hand: '1-5',
  board: 'Shift+1-5',
  boardMove: 'Left/Right',
} as const;

export const GAME_SHORTCUT_SECTIONS = [
  {
    title: 'Navigation',
    shortcuts: [
      { keys: 'Tab / Shift+Tab', description: 'Move focus between game controls.' },
      { keys: 'Enter / Space', description: 'Activate the currently focused control.' },
      { keys: 'Escape', description: 'Close the current layer or clear the current selection.' },
      { keys: GAME_SHORTCUTS.details, description: 'Focus the card details panel.' },
      {
        keys: GAME_SHORTCUTS.inspect,
        description: 'Open or close inspect mode for the selected card.',
      },
    ],
  },
  {
    title: 'Selection',
    shortcuts: [
      { keys: GAME_SHORTCUTS.hand, description: 'Select or toggle hand cards 1 through 5.' },
      {
        keys: GAME_SHORTCUTS.board,
        description:
          'Select board slots left-to-right, place a selected hand card, or target an empty slot.',
      },
      {
        keys: GAME_SHORTCUTS.boardMove,
        description: 'Move or swap the selected board unit one visible slot left or right.',
      },
    ],
  },
  {
    title: 'Actions',
    shortcuts: [
      { keys: GAME_SHORTCUTS.commit, description: 'Focus the main Battle or Commit button.' },
      { keys: GAME_SHORTCUTS.undo, description: 'Undo the last action when undo is available.' },
      {
        keys: GAME_SHORTCUTS.burn,
        description: 'Burn the currently selected hand card or board unit.',
      },
      { keys: GAME_SHORTCUTS.bag, description: 'Open or close the bag.' },
    ],
  },
  {
    title: 'Help',
    shortcuts: [
      { keys: GAME_SHORTCUTS.menu, description: 'Open or close the hamburger menu.' },
      { keys: GAME_SHORTCUTS.tutorial, description: 'Open or close the tutorial.' },
      { keys: '/ or ?', description: 'Open or close this keyboard shortcuts sheet.' },
    ],
  },
] as const;

const PRIMARY_ACTION_SELECTOR = [
  '[data-game-custom-action="true"]:not([disabled])',
  '[data-game-end-turn-action="true"]:not([disabled])',
].join(', ');
const CARD_DETAIL_SCROLL_SELECTOR = '[data-card-detail-scroll-region="true"]';

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;

  return (
    target.isContentEditable ||
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT'
  );
}

function getShortcutSlot(code: string) {
  const digitIndex = DIGIT_SHORTCUT_CODES.indexOf(code as (typeof DIGIT_SHORTCUT_CODES)[number]);
  if (digitIndex !== -1) return digitIndex;

  const numpadIndex = NUMPAD_SHORTCUT_CODES.indexOf(code as (typeof NUMPAD_SHORTCUT_CODES)[number]);
  return numpadIndex !== -1 ? numpadIndex : null;
}

export function GameKeyboardShortcuts() {
  useEffect(() => {
    const focusPrimaryAction = () => {
      const primaryAction = document.querySelector<HTMLElement>(PRIMARY_ACTION_SELECTOR);
      if (!primaryAction) return false;

      primaryAction.focus();
      return true;
    };

    const focusCardDetails = () => {
      const cardDetails = document.querySelector<HTMLElement>(CARD_DETAIL_SCROLL_SELECTOR);
      if (!cardDetails) return false;

      cardDetails.focus();
      return true;
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || isEditableTarget(event.target)) return;
      const {
        view,
        bag,
        cardSet,
        selection,
        showBag,
        showBattleOverlay,
        setSelection,
        setShowBag,
        burnHandCard,
        playHandCard,
        swapBoardPositions,
        burnBoardUnit,
        undo,
      } = useGameStore.getState();
      const { isOpen: menuOpen, open: openMenu, close: closeMenu } = useMenuStore.getState();
      const {
        isOpen: tutorialOpen,
        open: openTutorial,
        close: closeTutorial,
      } = useTutorialStore.getState();
      const {
        isOpen: helpOpen,
        open: openHelp,
        close: closeHelp,
      } = useShortcutHelpStore.getState();
      const {
        isOpen: inspectOpen,
        open: openInspect,
        close: closeInspect,
      } = useCardInspectStore.getState();

      if (!view) return;
      if (view.phase !== 'shop') return;

      const getInspectableCard = () => {
        if (selection?.type === 'hand') {
          return view.hand[selection.index] ?? null;
        }

        if (selection?.type === 'board') {
          return view.board[selection.index] ?? null;
        }

        if (selection?.type === 'bag') {
          const bagCardId = bag?.[selection.index];
          return bagCardId != null
            ? (cardSet?.find((card) => card.id === bagCardId) ?? null)
            : null;
        }

        return null;
      };

      const handleHandShortcut = (slotIndex: number) => {
        const card = view.hand[slotIndex];
        if (!card) return false;

        if (selection?.type === 'hand' && selection.index === slotIndex) {
          setSelection(null);
        } else {
          setSelection({ type: 'hand', index: slotIndex });
        }

        return true;
      };

      const handleBoardShortcut = (displayIndex: number) => {
        const boardIndex = BOARD_DISPLAY_TO_INDEX[displayIndex];
        const unit = view.board[boardIndex];

        if (unit) {
          if (selection?.type === 'board' && selection.index === boardIndex) {
            setSelection(null);
          } else {
            setSelection({ type: 'board', index: boardIndex });
          }
          return true;
        }

        if (selection?.type === 'hand') {
          playHandCard(selection.index, boardIndex);
          return true;
        }

        if (selection?.type === 'board') {
          swapBoardPositions(selection.index, boardIndex);
          return true;
        }

        return false;
      };

      const handleBurnShortcut = () => {
        if (selection?.type === 'hand') {
          burnHandCard(selection.index);
          return true;
        }

        if (selection?.type === 'board') {
          burnBoardUnit(selection.index);
          return true;
        }

        return false;
      };

      const handleBoardMoveShortcut = (direction: 'left' | 'right') => {
        if (selection?.type !== 'board') return false;

        const delta = direction === 'left' ? 1 : -1;
        const targetIndex = selection.index + delta;

        if (targetIndex < 0 || targetIndex >= view.board.length) {
          return true;
        }

        swapBoardPositions(selection.index, targetIndex);
        return true;
      };

      const key = event.key.toLowerCase();
      const isHelpShortcut = event.code === 'Slash';
      const hasPrimaryModifier = event.ctrlKey || event.metaKey;
      const hasUnsupportedModifier = event.altKey;
      const shortcutSlot = getShortcutSlot(event.code);
      const inspectableCard = getInspectableCard();
      const hasInspectableSelection = inspectableCard !== null;

      if (key === 'i' && !event.shiftKey && !hasPrimaryModifier && !hasUnsupportedModifier) {
        if (inspectOpen) {
          event.preventDefault();
          closeInspect();
        } else if (
          hasInspectableSelection &&
          !menuOpen &&
          !showBattleOverlay &&
          !helpOpen &&
          !tutorialOpen
        ) {
          event.preventDefault();
          openInspect(inspectableCard);
        }
        return;
      }

      if (inspectOpen) return;

      if (key === 't' && !hasPrimaryModifier && !hasUnsupportedModifier) {
        if (tutorialOpen) {
          event.preventDefault();
          closeTutorial();
        } else if (!menuOpen && !showBag && !showBattleOverlay && !helpOpen) {
          event.preventDefault();
          openTutorial('how-to-play');
        }
        return;
      }

      if (showBattleOverlay) return;

      if (isHelpShortcut && !hasPrimaryModifier && !hasUnsupportedModifier) {
        if (helpOpen) {
          event.preventDefault();
          closeHelp();
        } else if (!menuOpen && !showBag && !showBattleOverlay && !tutorialOpen) {
          event.preventDefault();
          openHelp();
        }
        return;
      }

      if (tutorialOpen || helpOpen || showBattleOverlay) return;

      if (key === 'm' && !event.shiftKey && !hasPrimaryModifier && !hasUnsupportedModifier) {
        event.preventDefault();
        if (menuOpen) {
          closeMenu();
        } else {
          openMenu();
        }
        return;
      }

      if (menuOpen) return;

      if (event.key === 'Escape') {
        if (showBag) {
          event.preventDefault();
          setShowBag(false);
        } else if (selection) {
          event.preventDefault();
          setSelection(null);
        }
        return;
      }

      if (showBag) {
        if (key === 'd' && !event.shiftKey && !hasPrimaryModifier && !hasUnsupportedModifier) {
          if (focusCardDetails()) {
            event.preventDefault();
          }
          return;
        }

        if (key === 'b' && !event.shiftKey && !hasPrimaryModifier && !hasUnsupportedModifier) {
          event.preventDefault();
          setShowBag(false);
        }
        return;
      }

      if (key === 'd' && !event.shiftKey && !hasPrimaryModifier && !hasUnsupportedModifier) {
        if (focusCardDetails()) {
          event.preventDefault();
        }
        return;
      }

      if (key === 'c' && !event.shiftKey && !hasPrimaryModifier && !hasUnsupportedModifier) {
        if (focusPrimaryAction()) {
          event.preventDefault();
        }
        return;
      }

      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        const handled =
          !event.shiftKey &&
          !hasPrimaryModifier &&
          !hasUnsupportedModifier &&
          handleBoardMoveShortcut(event.key === 'ArrowLeft' ? 'left' : 'right');

        if (handled) {
          event.preventDefault();
        }
        return;
      }

      if (shortcutSlot !== null) {
        const handled = event.shiftKey
          ? !hasPrimaryModifier && !hasUnsupportedModifier && handleBoardShortcut(shortcutSlot)
          : !hasPrimaryModifier && !hasUnsupportedModifier && handleHandShortcut(shortcutSlot);

        if (handled) {
          event.preventDefault();
        }
        return;
      }

      if (key === 'b' && !event.shiftKey && !hasPrimaryModifier && !hasUnsupportedModifier) {
        event.preventDefault();
        setShowBag(!showBag);
        return;
      }

      if (key === 'x' && !event.shiftKey && !hasPrimaryModifier && !hasUnsupportedModifier) {
        if (handleBurnShortcut()) {
          event.preventDefault();
        }
        return;
      }

      if (key === 'z' && !event.shiftKey && !hasPrimaryModifier && !hasUnsupportedModifier) {
        if (view.can_undo) {
          event.preventDefault();
          undo();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return null;
}
