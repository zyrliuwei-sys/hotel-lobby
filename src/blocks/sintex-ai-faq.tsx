import { Plus } from 'lucide-react';

import { m } from '@/paraglide/messages.js';

export function SintexAiFaq() {
  const items = [
    {
      question: m['syntx.faq.name.question'](),
      answer: m['syntx.faq.name.answer'](),
    },
    {
      question: m['syntx.faq.text.question'](),
      answer: m['syntx.faq.text.answer'](),
    },
    {
      question: m['syntx.faq.image.question'](),
      answer: m['syntx.faq.image.answer'](),
    },
    {
      question: m['syntx.faq.models.question'](),
      answer: m['syntx.faq.models.answer'](),
    },
    {
      question: m['syntx.faq.cost.question'](),
      answer: m['syntx.faq.cost.answer'](),
    },
    {
      question: m['syntx.faq.time.question'](),
      answer: m['syntx.faq.time.answer'](),
    },
    {
      question: m['syntx.faq.download.question'](),
      answer: m['syntx.faq.download.answer'](),
    },
    {
      question: m['syntx.faq.examples.question'](),
      answer: m['syntx.faq.examples.answer'](),
    },
  ];
  return (
    <section
      id="faq"
      className="syntx-faq-section"
      aria-labelledby="sintex-faq-heading"
    >
      <div className="syntx-section-heading">
        <div>
          <p className="syntx-section-kicker">{m['syntx.faq.kicker']()}</p>
          <h2 id="sintex-faq-heading">{m['syntx.faq.title']()}</h2>
        </div>
        <p>{m['syntx.faq.description']()}</p>
      </div>
      <div className="syntx-faq-list">
        {items.map((item, index) => (
          <details key={item.question} open={index === 0}>
            <summary>
              <span>{item.question}</span>
              <Plus size={18} aria-hidden="true" />
            </summary>
            <p>{item.answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
