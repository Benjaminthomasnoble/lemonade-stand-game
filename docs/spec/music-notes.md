# Lemonade Stand Wars: music (main theme and four stingers)

Style: Surf-Noir Lounge, original music. Made with Wavelength 0.6.0 from the composer brief in the game spec
(section "Music and sound"). Prompt from Ben: "Then music. Can use the wavelength skill." All five pieces share one
band and one musical idea: the ship's-horn call F-A-D, the hook "When | life gives you lem-ons" (F | A D C A F),
and a sour note (D-flat over B-flat minor 6) for bittersweet moments.

| File | Piece | Key / tempo | Length | Loudness (integrated) |
|---|---|---|---|---|
| lsw-theme-when-life-gives-you-lemons.mp3 | Main theme "When Life Gives You Lemons" | F major (bridge D minor), 120 BPM | 0:59 (56 s + ring-out) | -14.0 LUFS, -1.7 dBTP |
| lsw-stinger-rank-up.mp3 | Rank Up | F major, 120 BPM | 4.7 s | -14.0 LUFS |
| lsw-stinger-raid-incoming.mp3 | Raid Incoming | D harmonic minor, 160 BPM | 3.3 s (choked at 3.0 s) | -12.9 LUFS (+1 dB) |
| lsw-stinger-raid-won.mp3 | Raid Won | F major, 132 BPM | 4.3 s | -14.0 LUFS |
| lsw-stinger-squeezed-out.mp3 | Squeezed Out | F major with minor iv, 96 BPM | 6.8 s | -17.0 LUFS (-3 dB) |

## Main theme form (timestamps)

- 0:00 Intro (bars 1-2): bari sax and trombone blow the ship's horn call F2-A2-D3 over a ukulele tremolo and a cymbal swell; the bossa groove starts in bar 2.
- 0:04 A (bars 3-10): the whistled tune with ukulele, upright bass, cross-stick bossa and shaker; glockenspiel answers. The humble, early-game sound.
- 0:20 B, the noir bridge (bars 11-18): muted trumpet plays the hook in D minor over a walking bass, brushes, finger snaps, vibes and two spring-reverb guitar twangs. Drier and a little quieter.
- 0:36 A' (bars 19-26): full band. Whistle and surf guitar on the tune, horns answer and stab, organ pad, full kit, bongos, tambourine. The loudest part.
- 0:52 Tag (bars 27-28): the horn call in three octaves, a final F6/9 hit and a glockenspiel "cash-register ding", left to ring.

Section loudness after mastering: Intro -18.8, A -14.5, B -16.0, A' -12.4, Tag -11.5 LUFS.

## Stingers

- **Rank Up**: a rising call over Bb6 to C7 with a snare roll and a slide whistle sweeping left to right; arrival on F6/9 with kick, crash, a party-horn blat and a glockenspiel ding.
- **Raid Incoming**: two trumpets in octaves play D-F-Bb (the horn call gone sour) over tremolo surf guitar, floor-tom eighths and woodblock ticks; it hangs on A7(b9) and chokes dead at 3.0 s so the game's ticking countdown can take over (keep the woodblock tick going at 160 BPM, one per quarter note).
- **Raid Won**: a surf victory lick on whistle and guitar, two hits and a held F6/9 button, a party horn, then a falling slide whistle as the raiders wobble home.
- **Squeezed Out**: the hook slowed down, then a minor-four sigh; the last whistled note droops flat as the whistler runs out of breath, followed by a dry squeeze-bottle squeak. Funny-sad, never mournful.

Game use: stingers start on a downbeat with no fade-in; duck the music bed 12 dB under each (per the spec).

## Tracks and sounds

| Track | Plugin | Preset or patch | Role |
|---|---|---|---|
| Whistle | builtin:synth | custom: sine, faint octave, breath-noise band; mono legato, 30 ms glide; per-note scoops and late vibrato | Lead (sounds an octave above written) |
| Muted Trumpet | Surge XT | Clean Trumpet + cup-mute EQ (HP 450 Hz, +6 dB at 1.5 kHz, LP 4.8 kHz), slapback | Bridge lead |
| Ukulele | Surge XT | Nylon Acoustic Guitar, voiced D4-F5, strummed in code | Bossa strum |
| Glockenspiel | Surge XT | Lithovibes (transpose -12) | Answers, doublings, the ding |
| Upright Bass | Surge XT | String Bass (transpose +19) | Bass |
| Bass Sub | builtin:synth | BA Sub, low-passed at 160 Hz | Weight under the upright |
| Vibes | Surge XT | Golden Mallets + 4.5 Hz tremolo | Bridge comping |
| Surf Guitar | Surge XT | Stratus Clean, spring-reverb bus | Twangs, melody double, tremolo picking |
| Trumpet 1, Trumpet 2 | Surge XT | Clean Trumpet | Horn section |
| Trombone | Surge XT | Orchestral Trombone (transpose +12) | Horn call, chord thirds |
| Bari Sax | Surge XT | Tenor Sax (transpose +12), left channel only for mono safety | Horn call, roots, stabs |
| Organ | Surge XT | Leslied Organ, band-limited and widened | A' pad |
| Kick, Cross-stick, Snare, Hats, Crash, Toms | builtin:drums | GM kit | Bossa and surf kit |
| Shaker | Surge XT | Egg Shaker | Bossa shaker |
| Tambourine, Bongos, Woodblock, Snaps, Brush Sweep, Brush Slap | builtin:synth | custom percussion patches | Percussion |
| Cymbal Swell | builtin:fx | reverse swell (key 52) | Intro swell, Raid Incoming swell |
| Slide Whistle, Party Horn, Squeak | builtin:synth | custom patches with per-note pitch bends | Comic sound effects |

Buses: Plate (whistle, horns, mallets), Spring (surf guitar), Room (drums, brushes), Slap (muted trumpet). Master: high-pass, gentle glue compression (1.35:1), true-peak limiter at -1.8 dB, loudness target per piece.

## Rebuild

Each folder (theme, rank-up, raid-incoming, raid-won, squeezed-out) has `make-job.py` (writes `job.json`; the shared band is in `lsw_music.py`), `targets.json` (target loudness per track) and `gains.json` (faders measured by `wavelength stage`). Rebuild with:

    python3 make-job.py && wavelength render job.json --out out --png

All sounds are Surge XT factory presets and Wavelength's built-in synth and drums, so `wavelength kit install` on any machine reproduces them.
