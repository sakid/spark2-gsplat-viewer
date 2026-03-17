function isCallable(value) {
  return typeof value === 'function';
}

function runStep(step) {
  if (!isCallable(step)) return;
  step();
}

export class EditorCommandHistory {
  constructor({ maxEntries = 200, onChange = null } = {}) {
    this.maxEntries = Math.max(1, Number(maxEntries) || 200);
    this.onChange = isCallable(onChange) ? onChange : null;
    this.undoStack = [];
    this.redoStack = [];
    this.transaction = null;
  }

  canUndo() {
    return this.undoStack.length > 0;
  }

  canRedo() {
    return this.redoStack.length > 0;
  }

  beginTransaction(label = 'Batch edit') {
    if (this.transaction) return false;
    this.transaction = {
      label: String(label || 'Batch edit'),
      commands: []
    };
    this.emitChange();
    return true;
  }

  commitTransaction() {
    if (!this.transaction) return false;
    const { label, commands } = this.transaction;
    this.transaction = null;
    if (commands.length === 0) {
      this.emitChange();
      return false;
    }
    const composite = {
      label,
      do: () => {
        for (const command of commands) runStep(command.do);
      },
      undo: () => {
        for (let i = commands.length - 1; i >= 0; i -= 1) {
          runStep(commands[i].undo);
        }
      }
    };
    this.pushEntry(composite);
    return true;
  }

  rollbackTransaction() {
    if (!this.transaction) return false;
    this.transaction = null;
    this.emitChange();
    return true;
  }

  execute(command) {
    const normalized = this.normalizeCommand(command);
    if (!normalized) return false;

    runStep(normalized.do);
    if (this.transaction) {
      this.transaction.commands.push(normalized);
      this.redoStack.length = 0;
      this.emitChange();
      return true;
    }

    this.pushEntry(normalized);
    return true;
  }

  undo() {
    const command = this.undoStack.pop();
    if (!command) return false;
    runStep(command.undo);
    this.redoStack.push(command);
    this.emitChange();
    return true;
  }

  redo() {
    const command = this.redoStack.pop();
    if (!command) return false;
    runStep(command.do);
    this.undoStack.push(command);
    this.emitChange();
    return true;
  }

  clear() {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
    this.transaction = null;
    this.emitChange();
  }

  normalizeCommand(command) {
    if (!command || !isCallable(command.do) || !isCallable(command.undo)) {
      return null;
    }
    return {
      label: String(command.label || 'Edit'),
      do: command.do,
      undo: command.undo
    };
  }

  pushEntry(command) {
    this.undoStack.push(command);
    if (this.undoStack.length > this.maxEntries) {
      this.undoStack.splice(0, this.undoStack.length - this.maxEntries);
    }
    this.redoStack.length = 0;
    this.emitChange();
  }

  emitChange() {
    if (!this.onChange) return;
    this.onChange({
      canUndo: this.canUndo(),
      canRedo: this.canRedo(),
      undoCount: this.undoStack.length,
      redoCount: this.redoStack.length,
      activeTransactionLabel: this.transaction?.label ?? null
    });
  }
}

