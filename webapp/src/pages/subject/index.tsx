import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import subjectEndpoint from 'src/api/subjectEndpoint';
import type { Subject as SubjectType } from 'src/model/backend/entity/SubjectEntity';

const Subject = () => {
  const navigate = useNavigate();
  const [subjectList, setSubjectList] = useState<SubjectType[]>();

  useEffect(() => {
    subjectEndpoint.getSubject().then((res) => {
      setSubjectList(res?.data);
    });
  }, []);

  return (
    <div className="flex flex-col items-center gap-5">
      {subjectList?.map((v) => (
        <div
          className="w-4/5 cursor-pointer rounded-sm border p-2 text-center"
          onClick={() => navigate('/exam', { state: { subjectId: v.id, name: v.name } })}
        >
          {v.name}
        </div>
      ))}
    </div>
  );
};

export default Subject;
