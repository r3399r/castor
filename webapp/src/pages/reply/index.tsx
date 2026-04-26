import { useEffect, useState } from 'react';
import replyEndpoint from 'src/api/replyEndpoint';
import type { GetReplyResponse } from 'src/model/backend/api/Reply';
import { format } from 'date-fns';
import { Pagination } from '@mui/material';
import { LIMIT } from 'src/constant/backend/Pagination';

const Reply = () => {
  const [replyList, setReplyList] = useState<GetReplyResponse>();

  useEffect(() => {
    replyEndpoint.getReply().then((res) => {
      setReplyList(res?.data);
    });
  }, []);

  const onChangePage = (_event: React.ChangeEvent<unknown>, page: number) => {
    replyEndpoint
      .getReply({
        offset: ((page - 1) * LIMIT).toString(),
      })
      .then((res) => {
        setReplyList(res?.data);
      });
  };

  return (
    <div>
      {replyList && replyList.data.length === 0 && <div>尚無答題紀錄</div>}
      {replyList && replyList.data.length > 0 && (
        <div className="flex flex-col gap-4">
          {replyList.data.map((r) => {
            const fbPostId = r.parent === null ? r.question.fbPostId : r.parent.fbPostId;
            return (
              <div key={r.id}>
                <div>日期: {format(r.createdAt ?? new Date(), 'yyyy-MM-dd HH:mm:ss')}</div>
                <div>科目: {r.subject.name}</div>
                <div>
                  題目:{' '}
                  <a
                    href={`https://m.facebook.com/${fbPostId?.split('_')[0]}/posts/${fbPostId?.split('_')[1]}`}
                    target="_blank"
                    className="text-blue-600 underline"
                  >
                    連結
                  </a>
                </div>
                <div>分數: {r.score}</div>
                <div>作答: {r.repliedAnswer}</div>
              </div>
            );
          })}
          <div className="flex justify-center">
            <Pagination count={replyList.paginate.totalPages} onChange={onChangePage} />
          </div>
        </div>
      )}
    </div>
  );
};

export default Reply;
