import { MathJax } from 'better-react-mathjax';
import { useState } from 'react';

const Preview = () => {
  const [content, setContent] = useState<string>('');

  return (
    <div>
      <h2 className="mb-2 text-xl font-bold">Input:</h2>
      <textarea
        className="w-full border p-4"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Enter content to preview"
      />
      <h2 className="mb-2 text-xl font-bold">Output: (replace \n)</h2>
      <div className="w-full border p-4">{content.replace('\n', '').replace(/\\/g, '\\\\')}</div>
      <div className="mt-4 w-full">
        <h2 className="mb-2 text-xl font-bold">Preview:</h2>
        <div className="border p-4">
          <MathJax>
            <div dangerouslySetInnerHTML={{ __html: content.replace('\n', '') }}></div>
          </MathJax>
        </div>
      </div>
    </div>
  );
};

export default Preview;
