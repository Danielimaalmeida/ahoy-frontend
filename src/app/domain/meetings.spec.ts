import {
  acceptImages,
  authorLabel,
  carryOverCandidates,
  dateInputValue,
  decisionsAndActions,
  defaultMeeting,
  dueLabel,
  groupMeetings,
  imageFileRefusal,
  MAX_NOTE_IMAGE_BYTES,
  meetingToConfluence,
  moveInOrder,
  noteKindFields,
  noteShortcut,
  parseEmails,
  raisedByLabel,
  shortEmail,
  sniffImageType,
  startsAtFrom,
  suggestedCarryOver,
  topicWhen,
  type MeetingDoc,
  type MeetingLike,
  type NoteDoc,
  type TopicLike,
} from './meetings';

const meeting = (
  id: string,
  status: MeetingLike['status'],
  startsAt: string
): MeetingLike => ({ id, status, startsAt });

const topic = (over: Partial<TopicLike> & { id: string }): TopicLike => ({
  status: 'open',
  raisedBy: 'us',
  raisedByEmail: null,
  origin: 'planned',
  createdAt: '2026-10-06T10:24:00.000Z',
  notes: [],
  ...over,
});

describe('meetings', () => {
  const list = [
    meeting('past-1', 'ended', '2026-09-29T09:00:00.000Z'),
    meeting('next-2', 'planned', '2026-10-20T09:00:00.000Z'),
    meeting('now', 'in_progress', '2026-10-06T09:00:00.000Z'),
    meeting('past-2', 'ended', '2026-10-01T09:00:00.000Z'),
    meeting('next-1', 'planned', '2026-10-13T09:00:00.000Z'),
  ];

  it('lists the meeting running now, the planned ones soonest first and the ended ones latest first', () => {
    const groups = groupMeetings(list);
    expect(groups.now.map((m) => m.id)).toEqual(['now']);
    expect(groups.next.map((m) => m.id)).toEqual(['next-1', 'next-2']);
    expect(groups.past.map((m) => m.id)).toEqual(['past-2', 'past-1']);
  });

  it('opens the meeting running now, else the next one, else the latest that ended, else none', () => {
    expect(defaultMeeting(list)?.id).toBe('now');
    expect(defaultMeeting(list.filter((m) => m.id !== 'now'))?.id).toBe(
      'next-1'
    );
    expect(defaultMeeting(list.filter((m) => m.status === 'ended'))?.id).toBe(
      'past-2'
    );
    expect(defaultMeeting([])).toBeNull();
  });

  it('says who raised a topic, keeping a stakeholder short', () => {
    expect(raisedByLabel(topic({ id: 'a' }))).toBe('OTHER_COMPANY');
    expect(raisedByLabel(topic({ id: 'b', raisedBy: 'them' }))).toBe('ACME');
    expect(
      raisedByLabel(
        topic({ id: 'c', raisedBy: 'them', raisedByEmail: 'maria@example.com' })
      )
    ).toBe('ACME · maria@');
    expect(shortEmail('no-at-sign')).toBe('no-at-sign');
  });

  it('names the author by their name, and by the shortened actor while the name is not known', () => {
    expect(authorLabel('Q123456', 'Maria Silva')).toBe('Maria Silva');
    expect(authorLabel('alex@example.com', null)).toBe('alex@');
    expect(authorLabel('Q123456', null)).toBe('Q123456');
    expect(authorLabel('Q123456', '  ')).toBe('Q123456');
  });

  it('says a topic was planned, or when it was raised in the meeting', () => {
    expect(topicWhen(topic({ id: 'a' }))).toBe('planned');
    expect(topicWhen(topic({ id: 'b', origin: 'in_meeting' }))).toMatch(
      /^raised at \d{2}:\d{2}$/
    );
  });

  it('suggests carrying over the open topics nobody took a note on, and offers only open ones', () => {
    const topics = [
      topic({ id: 'noted', notes: [{}] }),
      topic({ id: 'silent' }),
      topic({ id: 'moved', status: 'moved' }),
    ];
    expect(suggestedCarryOver(topics)).toEqual(['silent']);
    expect(carryOverCandidates(topics).map((t) => t.id)).toEqual([
      'noted',
      'silent',
    ]);
  });

  it('moves one topic up or down the order, and keeps the order at either end', () => {
    expect(moveInOrder(['a', 'b', 'c'], 'b', -1)).toEqual(['b', 'a', 'c']);
    expect(moveInOrder(['a', 'b', 'c'], 'b', 1)).toEqual(['a', 'c', 'b']);
    expect(moveInOrder(['a', 'b', 'c'], 'a', -1)).toEqual(['a', 'b', 'c']);
    expect(moveInOrder(['a', 'b', 'c'], 'c', 1)).toEqual(['a', 'b', 'c']);
    expect(moveInOrder(['a'], 'z', 1)).toEqual(['a']);
  });

  describe('parseEmails', () => {
    it('splits on commas, semicolons and spaces, lower-cases and keeps each e-mail once, in order', () => {
      expect(
        parseEmails(
          ' Priya@example.com, jordan@example.com;priya@example.com  sam@example.com '
        )
      ).toEqual(['priya@example.com', 'jordan@example.com', 'sam@example.com']);
    });

    it('answers nothing for an empty or blank list', () => {
      expect(parseEmails('')).toEqual([]);
      expect(parseEmails(' , ;')).toEqual([]);
    });
  });

  describe('dateInputValue and startsAtFrom', () => {
    it('writes a date as a date input takes it, in local time', () => {
      expect(dateInputValue(new Date(2026, 9, 6, 23, 30))).toBe('2026-10-06');
      expect(dateInputValue(new Date(2026, 0, 2, 0, 5))).toBe('2026-01-02');
    });

    it('turns a local day and time into the ISO instant the API takes', () => {
      expect(startsAtFrom('2026-10-22', '09:30')).toBe(
        new Date(2026, 9, 22, 9, 30).toISOString()
      );
    });

    it('answers null for a day or time it cannot read', () => {
      expect(startsAtFrom('', '09:30')).toBeNull();
      expect(startsAtFrom('2026-10-22', '')).toBeNull();
      expect(startsAtFrom('22/10/2026', '09:30')).toBeNull();
      expect(startsAtFrom('2026-13-40', '09:30')).toBeNull();
    });
  });
});

describe('note kinds', () => {
  const plain = { kind: 'note', owner: null, dueOn: null } as const;
  const action = { kind: 'action', owner: 'Sam', dueOn: '2026-10-30' } as const;

  it('gives an action an owner and a due day, trimming the owner and treating a blank one as none', () => {
    expect(
      noteKindFields(plain, {
        kind: 'action',
        owner: '  Sam ',
        dueOn: '2026-10-30',
      })
    ).toEqual(action);
    expect(noteKindFields(plain, { kind: 'action', owner: '   ' })).toEqual({
      kind: 'action',
      owner: null,
      dueOn: null,
    });
  });

  it('keeps an action owner and due day that a change does not name, and clears them on null', () => {
    expect(noteKindFields(action, {})).toEqual(action);
    expect(noteKindFields(action, { dueOn: null })).toEqual({
      ...action,
      dueOn: null,
    });
  });

  it('drops the owner and due day of a note that stops being an action', () => {
    expect(noteKindFields(action, { kind: 'decision' })).toEqual({
      kind: 'decision',
      owner: null,
      dueOn: null,
    });
  });

  it('refuses an owner or a due day on a note that is not an action', () => {
    expect(noteKindFields(plain, { owner: 'Sam' })).toBe(
      'owner and dueOn are only for a note of kind action'
    );
    expect(
      noteKindFields(action, { kind: 'question', dueOn: '2026-10-30' })
    ).toBe('owner and dueOn are only for a note of kind action');
  });

  it('reads a typed shortcut as the kind and the rest as the text', () => {
    expect(noteShortcut('/d Exports stay synchronous')).toEqual({
      kind: 'decision',
      text: 'Exports stay synchronous',
    });
    expect(noteShortcut('  /A  Profile the query ')).toEqual({
      kind: 'action',
      text: 'Profile the query',
    });
    expect(noteShortcut('/q who owns it?\nand when?')).toEqual({
      kind: 'question',
      text: 'who owns it?\nand when?',
    });
    expect(noteShortcut('/n back to a note')).toEqual({
      kind: 'note',
      text: 'back to a note',
    });
  });

  it('leaves text without a shortcut, or with an unknown one, as typed', () => {
    expect(noteShortcut('A plain note')).toBeNull();
    expect(noteShortcut('/x not a kind')).toBeNull();
    expect(noteShortcut('/decision spelled out')).toBeNull();
    expect(noteShortcut('and/or /d later')).toBeNull();
  });

  it('says when an action is due, today, or how long it is overdue', () => {
    expect(dueLabel(null, '2026-10-24')).toBeNull();
    expect(dueLabel('2026-10-24', '2026-10-24')).toEqual({
      text: 'due today',
      overdue: false,
    });
    expect(dueLabel('2026-10-30', '2026-10-24')).toEqual({
      text: 'due Fri 30 Oct',
      overdue: false,
    });
    expect(dueLabel('2026-10-22', '2026-10-24')).toEqual({
      text: 'overdue since Thu 22 Oct',
      overdue: true,
    });
  });

  it('collects the decisions and the actions of a meeting in topic order', () => {
    const note = (text: string, kind: NoteDoc['kind']): NoteDoc => ({
      text,
      ...(kind !== undefined ? { kind } : {}),
      createdBy: 'q123',
      createdByName: null,
      createdAt: '2026-10-13T09:00:00.000Z',
    });
    const found = decisionsAndActions({
      topics: [
        { notes: [note('said', 'note'), note('act 1', 'action')] },
        { notes: [note('agreed', 'decision'), note('old', undefined)] },
        { notes: [note('act 2', 'action'), note('open?', 'question')] },
      ],
    });
    expect(found.decisions.map((n) => n.text)).toEqual(['agreed']);
    expect(found.actions.map((n) => n.text)).toEqual(['act 1', 'act 2']);
  });
});

describe('meetingToConfluence', () => {
  const at = (h: number, m: number, d = 13) =>
    new Date(2026, 9, d, h, m).toISOString();
  const meetingDoc = (over: Partial<MeetingDoc> = {}): MeetingDoc => ({
    id: 'm1',
    status: 'ended',
    startsAt: at(9, 30),
    endsAt: at(10, 0),
    title: 'Billing sync',
    seriesName: 'Weekly billing',
    stakeholders: ['maria@example.com'],
    topics: [],
    ...over,
  });

  it('writes the heading, when, status, series and stakeholders', () => {
    expect(meetingToConfluence(meetingDoc())).toBe(
      [
        'h1. Billing sync',
        '*When:* Tue 13 Oct · 09:30–10:00',
        '*Status:* Ended',
        '*Series:* Weekly billing',
        '*With:* maria@example.com',
        '',
        'h2. Topics',
        '_No topics._',
        '',
      ].join('\n')
    );
  });

  it('writes each topic with who raised it, where it moved and its notes', () => {
    const markup = meetingToConfluence(
      meetingDoc({
        seriesName: null,
        stakeholders: [],
        topics: [
          {
            id: 't1',
            title: 'Late fees',
            status: 'moved',
            raisedBy: 'them',
            raisedByEmail: 'maria@example.com',
            origin: 'in_meeting',
            createdAt: at(9, 45),
            movedTo: { meetingStartsAt: at(9, 30, 20) },
            notes: [
              {
                text: 'Agree a cap',
                createdBy: 'q123',
                createdByName: 'Alex Doe',
                createdAt: at(9, 50),
              },
            ],
          },
        ],
      })
    );
    expect(markup).toContain('h3. 1. Late fees');
    expect(markup).toContain(
      '_ACME · maria@ · raised at 09:45 · moved to Tue 20 Oct_'
    );
    expect(markup).toContain('* Agree a cap _(Alex Doe, 09:50)_');
    expect(markup).not.toContain('*Series:*');
    expect(markup).not.toContain('*With:*');
  });

  it('lists the decisions and the actions first, and tags each kind of note in its topic', () => {
    const note = (over: Partial<NoteDoc>): NoteDoc => ({
      text: 'x',
      createdBy: 'q123',
      createdByName: 'Alex Doe',
      createdAt: at(9, 50),
      ...over,
    });
    const markup = meetingToConfluence(
      meetingDoc({
        topics: [
          {
            id: 't1',
            title: 'Exports',
            status: 'open',
            raisedBy: 'us',
            raisedByEmail: null,
            origin: 'planned',
            createdAt: at(9, 30),
            movedTo: null,
            notes: [
              note({ text: 'Stay synchronous', kind: 'decision' }),
              note({
                text: 'Profile the query',
                kind: 'action',
                owner: 'Sam',
                dueOn: '2026-10-16',
              }),
              note({
                text: 'Write the release note',
                kind: 'action',
                owner: null,
                dueOn: null,
                doneAt: at(9, 55),
              }),
              note({ text: 'Who signs off', kind: 'question' }),
              note({ text: 'Said in passing', kind: 'note' }),
            ],
          },
        ],
      })
    );
    const lines = markup.split('\n');
    const at_ = (line: string) => lines.indexOf(line);
    expect(at_('h2. Decisions')).toBeGreaterThan(-1);
    expect(at_('* Stay synchronous')).toBe(at_('h2. Decisions') + 1);
    expect(at_('h2. Actions')).toBeGreaterThan(at_('h2. Decisions'));
    expect(at_('* Profile the query — Sam, due Fri 16 Oct')).toBe(
      at_('h2. Actions') + 1
    );
    expect(at_('* Write the release note — done')).toBe(at_('h2. Actions') + 2);
    expect(at_('h2. Topics')).toBeGreaterThan(at_('h2. Actions'));
    expect(markup).toContain(
      '* *Decision:* Stay synchronous _(Alex Doe, 09:50)_'
    );
    expect(markup).toContain(
      '* *Action:* Profile the query — Sam, due Fri 16 Oct _(Alex Doe, 09:50)_'
    );
    expect(markup).toContain('* *Question:* Who signs off _(Alex Doe, 09:50)_');
    expect(markup).toContain('* Said in passing _(Alex Doe, 09:50)_');
  });

  it("counts a note's images instead of copying them", () => {
    const image = { id: 'i' };
    const note = (text: string, images: readonly unknown[]): NoteDoc => ({
      text,
      images,
      createdBy: 'q123',
      createdByName: 'Alex Doe',
      createdAt: at(9, 50),
    });
    const markup = meetingToConfluence(
      meetingDoc({
        topics: [
          {
            id: 't1',
            title: 'Exports',
            status: 'open',
            raisedBy: 'us',
            raisedByEmail: null,
            origin: 'planned',
            createdAt: at(9, 30),
            movedTo: null,
            notes: [
              note('The old screen', [image]),
              note('Both mockups', [image, image]),
              note('No pictures', []),
            ],
          },
        ],
      })
    );
    expect(markup).toContain('* The old screen (1 image) _(Alex Doe, 09:50)_');
    expect(markup).toContain('* Both mockups (2 images) _(Alex Doe, 09:50)_');
    expect(markup).toContain('* No pictures _(Alex Doe, 09:50)_');
  });

  it('escapes markup and keeps line breaks in text people wrote', () => {
    const markup = meetingToConfluence(
      meetingDoc({
        title: '*Big* {panel}',
        topics: [
          {
            id: 't1',
            title: '[link]|x',
            status: 'open',
            raisedBy: 'us',
            raisedByEmail: null,
            origin: 'planned',
            createdAt: at(9, 0),
            movedTo: null,
            notes: [
              {
                text: 'one\ntwo',
                createdBy: 'q123',
                createdByName: null,
                createdAt: at(9, 5),
              },
            ],
          },
        ],
      })
    );
    expect(markup).toContain('h1. \\*Big\\* \\{panel\\}');
    expect(markup).toContain('h3. 1. \\[link\\]\\|x');
    expect(markup).toContain('* one \\\\ two');
  });
});

describe('note images', () => {
  const bytes = (...b: number[]) => new Uint8Array(b);

  it('recognises PNG, JPEG, GIF and WebP from their first bytes, and nothing else', () => {
    expect(
      sniffImageType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0))
    ).toBe('image/png');
    expect(sniffImageType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe('image/jpeg');
    expect(sniffImageType(new TextEncoder().encode('GIF89a...'))).toBe(
      'image/gif'
    );
    expect(sniffImageType(new TextEncoder().encode('GIF87a...'))).toBe(
      'image/gif'
    );
    expect(
      sniffImageType(new TextEncoder().encode('RIFF\0\0\0\0WEBPVP8 '))
    ).toBe('image/webp');
    expect(
      sniffImageType(new TextEncoder().encode('RIFF\0\0\0\0WAVE'))
    ).toBeNull();
    expect(
      sniffImageType(new TextEncoder().encode('<svg xmlns="x"/>'))
    ).toBeNull();
    expect(sniffImageType(bytes(0x89, 0x50))).toBeNull();
    expect(sniffImageType(bytes())).toBeNull();
  });

  it('refuses a file that is not one of the four formats, is empty or is over 5 MB', () => {
    expect(imageFileRefusal({ type: 'image/png', size: 10 })).toBeNull();
    expect(
      imageFileRefusal({ type: 'image/webp', size: MAX_NOTE_IMAGE_BYTES })
    ).toBeNull();
    expect(imageFileRefusal({ type: 'image/svg+xml', size: 10 })).toBe(
      'Only PNG, JPEG, WebP and GIF images can be added.'
    );
    expect(imageFileRefusal({ type: 'application/pdf', size: 10 })).toBe(
      'Only PNG, JPEG, WebP and GIF images can be added.'
    );
    expect(imageFileRefusal({ type: 'image/gif', size: 0 })).toBe(
      'The image is empty.'
    );
    expect(
      imageFileRefusal({ type: 'image/jpeg', size: MAX_NOTE_IMAGE_BYTES + 1 })
    ).toBe('The image is larger than 5 MB.');
  });

  it('takes the images that fit, in order, and says why the first other one was left out', () => {
    const png = { type: 'image/png', size: 10, name: 'a' };
    const svg = { type: 'image/svg+xml', size: 10, name: 'b' };
    const jpg = { type: 'image/jpeg', size: 10, name: 'c' };
    expect(acceptImages([png, svg, jpg], 10)).toEqual({
      images: [png, jpg],
      refusal: 'Only PNG, JPEG, WebP and GIF images can be added.',
    });
    expect(acceptImages([png, jpg], 1)).toEqual({
      images: [png],
      refusal: 'A note takes at most 10 images.',
    });
    expect(acceptImages([png], 0)).toEqual({
      images: [],
      refusal: 'A note takes at most 10 images.',
    });
    expect(acceptImages([], 10)).toEqual({ images: [], refusal: null });
  });
});
