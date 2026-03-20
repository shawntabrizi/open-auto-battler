import { useEffect } from 'react';
import { useGameStore } from '../store/gameStore';
import { useMenuStore } from '../store/menuStore';
import { useTutorialStore } from '../store/tutorialStore';

const DIGIT_SHORTCUT_CODES = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5'] as const;
const NUMPAD_SHORTCUT_CODES = ['Numpad1', 'Numpad2', 'Numpad3', 'Numpad4', 'Numpad5'] as const;
const BOARD_DISPLAY_TO_INDEX = [4, 3, 2, 1, 0] as const;

export const GAME_SHORTCUTS = {
  bag: 'B',
  menu: 'M',
  undo: 'Z',
  burn: 'X',
  hand: '1-5',
  board: 'Shift+1-5',
  boardMove: 'Left/Right',
} as const;

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
  const {
    view,
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
  } = useGameStore();
  const menuOpen = useMenuStore((state) => state.isOpen);
  const openMenu = useMenuStore((state) => state.open);
  const closeMenu = useMenuStore((state) => state.close);
  const tutorialOpen = useTutorialStore((state) => state.isOpen);

  useEffect(() => {
    if (!view) return;

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

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || isEditableTarget(event.target)) return;
      if (tutorialOpen || showBattleOverlay) return;
      if (view.phase !== 'shop') return;

      const key = event.key.toLowerCase();
      const hasPrimaryModifier = event.ctrlKey || event.metaKey;
      const hasUnsupportedModifier = event.altKey;
      const shortcutSlot = getShortcutSlot(event.code);

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
        if (key === 'b' && !event.shiftKey && !hasPrimaryModifier && !hasUnsupportedModifier) {
          event.preventDefault();
          setShowBag(false);
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

      if (key === 'z' && !event.shiftKey && !hasUnsupportedModifier) {
        if (view.can_undo) {
          event.preventDefault();
          undo();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    burnBoardUnit,
    burnHandCard,
    closeMenu,
    menuOpen,
    openMenu,
    playHandCard,
    selection,
    setSelection,
    setShowBag,
    showBag,
    showBattleOverlay,
    swapBoardPositions,
    tutorialOpen,
    undo,
    view,
  ]);

  return null;
}
