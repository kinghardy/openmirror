// Pool Guide content for the Billiards Rack channel (#app-pool in index.html).
// Edit freely; index.html only reads window.POOL_GUIDE. Reload the kiosk to see changes.
//
// categories: shown as tiles; `games` lists ids from the games table below (in order).
// games: { name, ball (number drawn as the icon), tagline, players, ruleset,
//          soon: true for a placeholder, sections: { setup, play, fouls } }
// Each section is a list of blocks:
//   { h: 'Heading' }                      sub-heading
//   { p: 'Paragraph' }                    text; **double stars** make bold
//   { steps: ['...', '...'] }             numbered steps
//   { items: [['Term', 'Detail'], ...], tone: 'bad' }   term/detail list (tone 'bad' = red)
//   { note: 'Tip or house-rule warning' } highlighted callout
//   { diagrams: [ { type: 'table', rack: ROWS, caption },
//                 { type: 'rack', rows: ROWS, rings: [ball numbers], caption } ] }
// ROWS: ball numbers row by row starting at the apex (the ball on the foot spot).
// Balls 1-7 solids, 8 black, 9-15 stripes, 0 = cue ball.

window.POOL_GUIDE = {
  categories: [
    { id: 'classics', icon: '🎱', name: 'League Classics', blurb: 'The games on every league night',
      games: ['8ball', '9ball', '10ball', 'straight'] },
    { id: 'party', icon: '🎉', name: 'Party Games', blurb: '3 or more players', games: [] },
    { id: 'specialty', icon: '🧠', name: 'Specialty', blurb: 'Banks, one-pocket & more', games: [] },
    { id: 'practice', icon: '🎯', name: 'Solo Practice', blurb: 'Drills for one player', games: [] }
  ],

  games: {
    '8ball': {
      name: '8-Ball', ball: 8, players: '2 players or teams', ruleset: 'World-standard (WPA) rules',
      tagline: 'Solids vs. stripes, then sink the 8',
      sections: {
        setup: [
          { diagrams: [
            { type: 'table', rack: [[1], [11, 2], [3, 8, 12], [13, 4, 14, 5], [6, 15, 7, 9, 10]],
              caption: 'Rack on the foot spot, break from the kitchen' },
            { type: 'rack', rows: [[1], [11, 2], [3, 8, 12], [13, 4, 14, 5], [6, 15, 7, 9, 10]],
              rings: [8, 6, 10], caption: 'Dashed rings: the 8 and the two back corners' }
          ] },
          { steps: [
            'Rack all **15 balls** tightly in the triangle.',
            'Put the **apex ball on the foot spot**.',
            'The **8-ball goes in the middle** of the third row.',
            'Put **one solid and one stripe** in the two back corners. Every other ball can go anywhere.',
            'Lag or flip a coin. The winner **breaks from the kitchen** (behind the head string).'
          ] },
          { note: 'House rules vary. Before the first rack, agree on what happens if the 8 goes in on the break and if you scratch on the 8.' }
        ],
        play: [
          { h: 'The break' },
          { items: [
            ['Legal break', 'Pocket a ball, or drive at least **4 object balls** to a rail.'],
            ['Not legal', 'Opponent picks: play the table as it lies, re-rack and break, or have you break again.'],
            ['8 on the break', 'Not a loss. The breaker re-spots the 8 and keeps shooting, or re-racks.'],
            ['Scratch on the break', 'Foul. Opponent gets the cue ball **in the kitchen**.']
          ] },
          { h: 'Choosing groups' },
          { p: 'After the break the table is **open**. You may hit a solid to make a stripe, or the other way round. The first ball you legally pocket on a called shot makes that group (solids or stripes) **yours**.' },
          { h: 'Every shot' },
          { steps: [
            '**Call the ball and the pocket.** Obvious shots don’t need calling. Banks, kicks and combos always do.',
            'Hit **one of your own balls first**.',
            'Then pocket a ball, or make **any ball touch a rail**.',
            'Pocket a called ball and you **keep shooting**. Miss and it’s your opponent’s turn.'
          ] },
          { h: 'Winning' },
          { p: 'Clear your whole group, then **call and pocket the 8**. Make it legally and the rack is yours.' }
        ],
        fouls: [
          { p: 'Foul = your turn ends and your opponent gets **ball in hand anywhere** on the table.' },
          { items: [
            ['Scratch', 'The cue ball goes in a pocket or off the table.'],
            ['Wrong ball first', 'The cue ball hits the other group, or hits the 8 too early.'],
            ['No rail', 'After contact, nothing is pocketed and no ball touches a rail.'],
            ['Ball off the table', 'You knock any ball off the table.'],
            ['No foot down', 'Neither foot is touching the floor when you shoot.'],
            ['Double hit / push', 'The tip touches the cue ball twice, or stays on it.'],
            ['Touching balls', 'Any ball moves because of your hand, clothes or cue.'],
            ['Shooting too soon', 'You shoot before every ball has stopped.']
          ] },
          { h: 'Instant loss of the game' },
          { tone: 'bad', items: [
            ['Early 8', 'You pocket the 8 before your group is cleared.'],
            ['Wrong pocket', 'The 8 drops in a pocket you didn’t call.'],
            ['Foul on the 8', 'You foul or scratch on the shot that pockets the 8.'],
            ['8 off the table', 'You knock the 8 off the table.']
          ] },
          { note: 'Scratching while aiming at the 8 **without** pocketing it is a normal foul under WPA rules. Many bars play it as a loss, so agree on it before you start.' }
        ]
      }
    },

    '9ball':    { name: '9-Ball', ball: 9, players: '2 players', tagline: 'Lowest ball first, sink the 9 to win', soon: true },
    '10ball':   { name: '10-Ball', ball: 10, players: '2 players', tagline: 'Rotation with every shot called', soon: true },
    'straight': { name: 'Straight Pool', ball: 14, players: '2 players', tagline: '14.1 continuous, race to points', soon: true }
  }
};
