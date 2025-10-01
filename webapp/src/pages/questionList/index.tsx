import { Pagination } from '@mui/material';
import { useEffect, useState } from 'react';
import questionEndpoint from 'src/api/questionEndpoint';
import type { ModifiedQuestion } from 'src/model/backend/api/Question';

const LIMIT = 100;

const QuestionList = () => {
  const [list, setList] = useState<ModifiedQuestion[]>();

  const [page, setPage] = useState<number>(1);
  const [count, setCount] = useState<number>();

  useEffect(() => {
    questionEndpoint
      .getQuestion({ limit: LIMIT.toString(), offset: ((page - 1) * LIMIT).toString() })
      .then((res) => {
        setList(res?.data.data);
        setCount(res?.data.paginate.totalPages);
      });
  }, [page]);
  return (
    <div>
      {list?.map((v) => (
        <div key={v.uid}>{v.uid}</div>
      ))}
      <Pagination count={count} page={page} onChange={(_e, v) => setPage(v)} />
    </div>
  );
};

export default QuestionList;
