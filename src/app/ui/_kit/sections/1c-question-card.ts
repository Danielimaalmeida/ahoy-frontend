import { Component, signal } from '@angular/core';
import { FormControl } from '@angular/forms';
import type { QuestionAnswer } from '@ui/question-card/question-card';
import { QuestionCard } from '@ui/question-card/question-card';

/** Gallery: the QuestionCard preview (open), plus the answered and disabled states. Sending only records it here. */
@Component({
  selector: 'ah-kit-question-card',
  imports: [QuestionCard],
  template: `
    <div class="kit-stack">
      <ah-question-card
        questionId="Q1"
        [round]="1"
        text="Should the PDF include the company's VAT number and address block, or only the line items and totals?"
        [answer]="answered"
      />
      <ah-question-card
        questionId="Q2"
        [round]="1"
        text="Where should the download be offered: on the receipt page only, or also from the order history?"
        [recommendation]="q2Recommendation"
        [answer]="sent()"
        [control]="answer"
        actor="alex@example.com"
        (send)="send($event)"
      />
      <ah-question-card
        questionId="Q3"
        [round]="1"
        text="Should the PDF round tax per line or on the total?"
        [recommendation]="{
          agent: 'Cartographer',
          text: 'On the total, to match the amount charged.',
        }"
        disabled
        disabledReason="The voyage was stopped, so it isn't waiting for answers."
      />
    </div>
  `,
})
export class KitQuestionCard {
  protected readonly q2Recommendation = {
    agent: 'Cartographer',
    text: 'Receipt page only for now; bulk download is better as its own story.',
  };
  protected readonly answer = new FormControl('', { nonNullable: true });
  protected readonly sent = signal<QuestionAnswer | null>(null);
  protected readonly answered: QuestionAnswer = {
    text: 'Include the VAT number and the full address block, same as the emailed receipt.',
    actor: 'sam@example.com',
    at: '2026-10-06T09:12:00Z',
    note: 'used the recommendation, edited',
  };

  protected send(text: string): void {
    this.sent.set({
      text,
      actor: 'alex@example.com',
      at: new Date().toISOString(),
    });
  }
}
