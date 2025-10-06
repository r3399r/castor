import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import questionEndpoint from 'src/api/questionEndpoint';
import type { Question } from 'src/model/backend/entity/QuestionEntity';
import IcLoader from 'src/assets/ic-loader.svg';
import { MathJax } from 'better-react-mathjax';

const Question = () => {
  const { id } = useParams();
  const [question, setQuestion] = useState<Question>();

  useEffect(() => {
    questionEndpoint.getQuestionId(id ?? '').then((res) => setQuestion(res?.data));
  }, [id]);

  if (!question)
    return (
      <div className="flex items-center justify-center">
        <div className="w-20 outline-none">
          <img src={IcLoader} />
        </div>
      </div>
    );

  return (
    <div>
      <MathJax>
        <div dangerouslySetInnerHTML={{ __html: question.content }}></div>
      </MathJax>
    </div>
  );
};

export default Question;
