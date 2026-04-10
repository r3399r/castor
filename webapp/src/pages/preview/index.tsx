import { MathJax } from 'better-react-mathjax';
import { useMemo, useState } from 'react';
import type { PostQuestionRequest } from 'src/model/backend/api/Question';

const Preview = () => {
  const [input, setInput] = useState<string>('');
  const payload = useMemo(() => {
    try {
      return JSON.parse(input) as Partial<PostQuestionRequest>;
    } catch {
      return null;
    }
  }, [input]);

  return (
    <div>
      <h2 className="mb-2 text-xl font-bold">Input:</h2>
      <textarea
        className="w-full border p-4"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Enter content to preview"
      />
      <h3 className="mt-2 font-bold">Parent Question</h3>
      <div>subjectId: {payload?.subjectId ?? 'Not specified'}</div>
      <div>
        type: {payload?.type ?? 'Not specified'}{' '}
        {payload?.type === 'GROUP' && payload.childQuestions?.length === 0 && (
          <span className="text-red-500">題組必須有子題</span>
        )}
      </div>
      <div>imageUrl: {payload?.imageUrl ?? 'Not specified'}</div>
      <div>content: {payload?.content ?? 'Not specified'}</div>
      <div>difficulty: {payload?.difficulty ?? 'Not specified'}</div>
      <div>examId: {payload?.examId ?? 'Not specified'}</div>
      <div>tagIds: {payload?.tagIds?.join(', ') ?? 'Not specified'}</div>
      <div>conceptIds: {payload?.conceptIds?.join(', ') ?? 'Not specified'}</div>
      {payload?.childQuestions?.map((child, index) => (
        <div key={index}>
          <h3 className="mt-2 font-bold">Child Question {index + 1}:</h3>
          <div>type: {child.type ?? 'Not specified'}</div>
          <div>sortOrder: {child.sortOrder ?? 'Not specified'}</div>
          <div>content: {child.content ?? 'Not specified'}</div>
          <div>options: {child.options ?? 'Not specified'}</div>
          <div>answer: {child.answer ?? 'Not specified'}</div>
          <div>difficulty: {child.difficulty ?? 'Not specified'}</div>
        </div>
      ))}
      <div className="mt-4 w-full">
        <h2 className="mb-2 text-xl font-bold">Preview:</h2>
        <div className="border p-4">
          <MathJax dynamic>
            <div dangerouslySetInnerHTML={{ __html: payload?.content ?? '' }}></div>
            {payload?.childQuestions?.map((child, index) => (
              <div key={index} dangerouslySetInnerHTML={{ __html: child.content ?? '' }} />
            ))}
          </MathJax>
        </div>
      </div>
    </div>
  );
};

export default Preview;
