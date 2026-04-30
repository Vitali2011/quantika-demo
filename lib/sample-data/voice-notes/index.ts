import fs from 'fs';
import path from 'path';

export interface VoiceFixture {
  id: string;
  rawTranscript: string;
  expected: any; // can be cargo, vessel, or recap shape
}

export function loadVoiceFixtures(): VoiceFixture[] {
  const ids = ['voice-01', 'voice-02'];
  return ids.map((id) => ({
    id,
    rawTranscript: fs.readFileSync(path.join(__dirname, `${id}.txt`), 'utf-8'),
    expected: require(`./${id}.expected.json`),
  }));
}
