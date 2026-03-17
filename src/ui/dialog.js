const eventUnsub = (eventBus, event, handler) => eventBus.on?.(event, handler) ?? (() => eventBus.off?.(event, handler));

const createEl = (tag, className, text) => {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text != null) el.textContent = text;
  return el;
};

export class DialogPanel {
  constructor({ container, eventBus }) {
    this.container = container;
    this.eventBus = eventBus;
    this.disposers = [];
    this.dialog = { active: false };
    this.focus = { interactable: null };
    this.gameState = null;
    this.levelState = null;

    this.root = createEl('div', 'spark-dialog');
    this.container.replaceChildren(this.root);

    this.disposers.push(
      eventUnsub(eventBus, 'dialog:started', (payload) => { this.dialog = payload ?? { active: true }; this.render(); }),
      eventUnsub(eventBus, 'dialog:updated', (payload) => { this.dialog = payload ?? this.dialog; this.render(); }),
      eventUnsub(eventBus, 'dialog:ended', (payload) => { this.dialog = payload ?? { active: false }; this.render(); }),
      eventUnsub(eventBus, 'interaction:focusChanged', (payload) => { this.focus = payload ?? { interactable: null }; this.render(); }),
      eventUnsub(eventBus, 'game:stateChanged', (payload) => { this.gameState = payload ?? null; this.render(); }),
      eventUnsub(eventBus, 'gameplay:levelState', (payload) => { this.levelState = payload ?? null; this.render(); })
    );

    this.render();
  }

  render() {
    this.root.replaceChildren();

    if (this.dialog?.active) {
      this.root.append(this.renderConversation());
      return;
    }

    this.root.append(this.renderIdle());
  }

  renderIdle() {
    const wrap = createEl('div', 'spark-dialog-idle');
    const levelText = this.levelState?.text ? String(this.levelState.text) : null;
    if (levelText) {
      wrap.append(createEl('p', 'spark-dialog-hint', levelText));
    }
    const focus = this.focus?.interactable ?? null;
    if (!focus) {
      wrap.append(createEl('p', 'spark-empty', 'No dialog active.'));
      wrap.append(this.renderQuestSummary());
      wrap.append(createEl('p', 'spark-dialog-hint', 'Look at an NPC and press E to interact.'));
      return wrap;
    }

    const speaker = focus.speakerName ? String(focus.speakerName) : 'Someone';
    const prompt = focus.prompt ? String(focus.prompt) : 'Talk';
    wrap.append(createEl('p', 'spark-dialog-focus', `${speaker}`));
    wrap.append(this.renderQuestSummary());
    wrap.append(createEl('p', 'spark-dialog-hint', `Press E to ${prompt}.`));
    return wrap;
  }

  renderQuestSummary() {
    const quests = this.gameState?.quests ?? null;
    const sheep = quests?.sheep ?? null;
    if (!sheep) return createEl('p', 'spark-dialog-hint', 'Quest: talk to Sean to begin.');
    if (sheep.status === 'completed') return createEl('p', 'spark-dialog-hint', 'Quest: sheep recovered.');
    const stage = sheep.stage ? String(sheep.stage) : 'active';
    if (stage === 'find') return createEl('p', 'spark-dialog-hint', 'Quest: find the lost sheep.');
    if (stage === 'return') return createEl('p', 'spark-dialog-hint', 'Quest: return to Sean.');
    return createEl('p', 'spark-dialog-hint', `Quest: ${stage}.`);
  }

  renderConversation() {
    const wrap = createEl('div', 'spark-dialog-conversation');
    const header = createEl('div', 'spark-dialog-header');
    const speaker = this.dialog?.speaker ? String(this.dialog.speaker) : '...';
    header.append(createEl('div', 'spark-dialog-speaker', speaker));

    const body = createEl('div', 'spark-dialog-body');
    const text = this.dialog?.renderedText ? String(this.dialog.renderedText) : '';
    body.append(createEl('p', 'spark-dialog-text', text || '...'));

    const choiceList = createEl('div', 'spark-dialog-choices');
    const choices = Array.isArray(this.dialog?.choices) ? this.dialog.choices : [];
    if (choices.length) {
      choices.forEach((choice) => {
        const index = Number(choice.index);
        const label = `${Number.isFinite(index) ? index + 1 : ''}${choice.text ? '. ' : ''}${choice.text ?? ''}`.trim();
        const button = createEl('button', 'spark-dialog-choice', label || 'Choose');
        button.type = 'button';
        button.addEventListener('click', () => this.eventBus.emit('dialog:chooseRequested', { index }));
        choiceList.append(button);
      });
    } else {
      const advance = createEl('button', 'spark-dialog-advance', 'Continue (Space/Enter)');
      advance.type = 'button';
      advance.addEventListener('click', () => this.eventBus.emit('dialog:advanceRequested'));
      choiceList.append(advance);
    }

    const footer = createEl('div', 'spark-dialog-footer');
    footer.append(createEl('div', 'spark-dialog-hints', 'Esc: Close · 1-9: Choose'));
    const close = createEl('button', 'spark-dialog-close', 'Close (Esc)');
    close.type = 'button';
    close.addEventListener('click', () => this.eventBus.emit('dialog:closeRequested'));
    footer.append(close);

    wrap.append(header, body, choiceList, footer);
    return wrap;
  }

  dispose() {
    for (const dispose of this.disposers.splice(0)) dispose();
    this.container.replaceChildren();
  }
}
