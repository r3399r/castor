import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import subjectEndpoint from 'src/api/subjectEndpoint';
import type { Exam as ExamType } from 'src/model/backend/entity/ExamEntity';

const Exam = () => {
  const location = useLocation();
  const state = location.state as { subjectId: string; name: string };
  const [examList, setExamList] = useState<ExamType[]>();

  useEffect(() => {
    subjectEndpoint.getSubjectIdExam(state.subjectId).then((res) => {
      setExamList(res?.data);
    });
  }, [state.subjectId]);

  return (
    <>
      <div className="pb-5 text-center text-2xl font-bold">{state.name}</div>
      <div className="flex flex-col items-center gap-5">
        {examList?.map((v) => (
          <div className="w-4/5 cursor-pointer rounded-sm border p-2 text-center">{v.name}</div>
        ))}
      </div>
    </>
  );
};

export default Exam;
