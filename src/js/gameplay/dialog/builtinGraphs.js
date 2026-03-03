export const BUILTIN_DIALOG_GRAPHS = Object.freeze({
  sean_intro: {
    id: 'sean_intro',
    start: 'start',
    nodes: {
      start: {
        type: 'line',
        speaker: 'Sean',
        text: 'Hey there.',
        next: 'menu',
        commands: [
          { op: 'setFlag', key: 'met_sean', value: true }
        ]
      },
      menu: {
        type: 'choice',
        speaker: 'Sean',
        text: 'What do you want to ask?',
        choices: [
          { text: 'Who are you?', next: 'who' },
          {
            text: 'Need any help?',
            next: 'quest_offer',
            condition: { not: { flag: 'accepted_sheep_quest' } }
          },
          {
            text: "How's the quest going?",
            next: 'quest_status',
            condition: { flag: 'accepted_sheep_quest' }
          },
          { text: 'Goodbye.', next: 'end' }
        ]
      },
      who: {
        type: 'line',
        speaker: 'Sean',
        text: "I'm Sean. I keep an eye on this place.",
        next: 'menu'
      },
      quest_offer: {
        type: 'line',
        speaker: 'Sean',
        text: 'Actually, yes. I lost track of my sheep. If you find them, let me know.',
        next: 'menu',
        commands: [
          { op: 'setFlag', key: 'accepted_sheep_quest', value: true },
          { op: 'startQuest', id: 'sheep' },
          { op: 'setQuestStage', id: 'sheep', stage: 'find' }
        ]
      },
      quest_status: {
        type: 'goto',
        target: 'quest_done',
        elseTarget: 'quest_in_progress',
        condition: { quest: 'sheep', status: 'completed' }
      },
      quest_in_progress: {
        type: 'line',
        speaker: 'Sean',
        text: 'No luck yet? Keep looking.',
        next: 'menu'
      },
      quest_done: {
        type: 'line',
        speaker: 'Sean',
        text: 'You found them? Thank you.',
        next: 'menu'
      },
      end: {
        type: 'end',
        commands: [
          { op: 'endDialog' }
        ]
      }
    }
  },
  sheep_found: {
    id: 'sheep_found',
    start: 'start',
    nodes: {
      start: {
        type: 'line',
        speaker: 'Lost Sheep',
        text: 'Baa! You found me. Sean will be glad.',
        next: 'end',
        commands: [
          { op: 'setFlag', key: 'found_sheep', value: true },
          { op: 'setQuestStage', id: 'sheep', stage: 'return' },
          { op: 'completeQuest', id: 'sheep' }
        ]
      },
      end: {
        type: 'end',
        commands: [
          { op: 'endDialog' }
        ]
      }
    }
  }
});
