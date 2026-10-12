import { TestBed } from '@angular/core/testing';
import type { RuntimeStatus } from '@domain/types';
import { WorkerStartupNotice } from './worker-startup';
import { CLOCK } from '@ui/pipes/clock';

describe('WorkerStartupNotice', () => {
  beforeEach(() =>
    TestBed.configureTestingModule({
      providers: [
        {
          provide: CLOCK,
          useValue: () => new Date('2026-10-12T08:00:00.000Z'),
        },
      ],
    })
  );
  it('announces confirmed node creation then clears the notice on runtime transition', async () => {
    const fixture = TestBed.createComponent(WorkerStartupNotice);
    const runtimeStatus: RuntimeStatus = {
      state: 'waiting_for_node',
      reason: 'TriggeredScaleUp',
      message: '<img src=x onerror=alert(1)>',
      observedAt: '2026-10-12T08:00:00.000Z',
    };
    fixture.componentRef.setInput('run', { status: 'running', runtimeStatus });
    await fixture.whenStable();
    const root: HTMLElement = fixture.nativeElement;
    expect(root.querySelector('[role=status]')?.textContent).toContain(
      'Waiting for a new node'
    );
    expect(root.querySelector('details')?.textContent).toContain(
      runtimeStatus.message
    );
    expect(root.querySelector('img')).toBeNull();
    fixture.componentRef.setInput('run', {
      status: 'running',
      runtimeStatus: { ...runtimeStatus, state: 'running' },
    });
    await fixture.whenStable();
    expect(root.querySelector('[role=status]')).toBeNull();
  });

  it('shows no new notice for an older backend', async () => {
    const fixture = TestBed.createComponent(WorkerStartupNotice);
    fixture.componentRef.setInput('run', { status: 'running' });
    await fixture.whenStable();
    const root: HTMLElement = fixture.nativeElement;
    expect(root.querySelector('[role=status]')).toBeNull();
  });
});
