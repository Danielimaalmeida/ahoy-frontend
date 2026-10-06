# QuestionCard

One agent question: its id and round, the question, the agent's recommendation, and either the final answer or the answer form.

- Open questions get the `ah-question--open` ring (status-input colours). Answered ones show the answer, who answered and when, and a "Final" lock: answers cannot be edited.
- "Use recommendation" copies the recommendation into the answer field as a starting point; it never sends.
- The send button states finality in the hint next to it: "Answers are final once sent."
