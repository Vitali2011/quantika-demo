/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { FabVoice, type MediaRecorderLike } from '@/components/mobile/FabVoice';

class FakeRecorder implements MediaRecorderLike {
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  state = 'inactive';
  start() {
    this.state = 'recording';
  }
  stop() {
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob(['x'], { type: 'audio/webm' }) });
    this.onstop?.();
  }
}

describe('FabVoice', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'vibrate', {
      value: jest.fn().mockReturnValue(true),
      configurable: true,
      writable: true,
    });
  });

  it('renders idle button by default', () => {
    render(<FabVoice />);
    const btn = screen.getByTestId('fab-voice');
    expect(btn.getAttribute('data-state')).toBe('idle');
  });

  it('transitions idle → recording on press', async () => {
    const states: string[] = [];
    const fakeStream = {} as MediaStream;
    render(
      <FabVoice
        getUserMedia={() => Promise.resolve(fakeStream)}
        recorderFactory={() => new FakeRecorder()}
        onStateChange={(s) => states.push(s)}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId('fab-voice'));
    });
    await waitFor(() => {
      expect(screen.getByTestId('fab-voice').getAttribute('data-state')).toBe('recording');
    });
    expect(states).toContain('recording');
  });

  it('full state machine idle → recording → uploading → done', async () => {
    const states: FabVoiceStateLocal[] = [];
    type FabVoiceStateLocal = 'idle' | 'recording' | 'uploading' | 'done';
    const fetchMock = jest.fn().mockImplementation((url: string) => {
      if (url.includes('transcribe')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ text: 'hello world' }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });
    const recorder = new FakeRecorder();
    render(
      <FabVoice
        getUserMedia={() => Promise.resolve({} as MediaStream)}
        recorderFactory={() => recorder}
        fetchImpl={fetchMock as unknown as typeof fetch}
        onStateChange={(s) => states.push(s as FabVoiceStateLocal)}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId('fab-voice'));
    });
    await waitFor(() =>
      expect(screen.getByTestId('fab-voice').getAttribute('data-state')).toBe('recording'),
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId('fab-voice'));
    });

    await waitFor(() =>
      expect(states).toContain('uploading'),
    );
    await waitFor(() =>
      expect(states).toContain('done'),
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const transcribeCall = fetchMock.mock.calls.find((c) =>
      String(c[0]).includes('transcribe'),
    );
    const intakeCall = fetchMock.mock.calls.find((c) => String(c[0]).includes('intake'));
    expect(transcribeCall).toBeTruthy();
    expect(intakeCall).toBeTruthy();
    expect(JSON.parse(intakeCall![1].body as string)).toMatchObject({
      source: 'voice',
      body: 'hello world',
    });
  });

  it('returns to idle on getUserMedia rejection', async () => {
    render(
      <FabVoice
        getUserMedia={() => Promise.reject(new Error('denied'))}
        recorderFactory={() => new FakeRecorder()}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId('fab-voice'));
    });
    await waitFor(() =>
      expect(screen.getByTestId('fab-voice').getAttribute('data-state')).toBe('idle'),
    );
  });

  it('skips intake when transcript is empty', async () => {
    const fetchMock = jest.fn().mockImplementation((url: string) => {
      if (url.includes('transcribe')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ text: '' }) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });
    const recorder = new FakeRecorder();
    render(
      <FabVoice
        getUserMedia={() => Promise.resolve({} as MediaStream)}
        recorderFactory={() => recorder}
        fetchImpl={fetchMock as unknown as typeof fetch}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId('fab-voice'));
    });
    await waitFor(() =>
      expect(screen.getByTestId('fab-voice').getAttribute('data-state')).toBe('recording'),
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId('fab-voice'));
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  });
});
