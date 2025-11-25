import { useEffect, useState, type ChangeEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import questionEndpoint from 'src/api/questionEndpoint';
import type { Question } from 'src/model/backend/entity/QuestionEntity';
import { MathJax } from 'better-react-mathjax';
import { Button } from '@mui/material';
import Modal from 'src/components/Modal';
import type { GetQuestionIdResponse, ModifiedReply } from 'src/model/backend/api/Question';
import { useDispatch, useSelector } from 'react-redux';
import { finishWaiting, setCategoryId, startWaiting } from 'src/redux/uiSlice';
import randomcolor from 'randomcolor';
import type { RootState } from 'src/redux/store';

const Question = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { id } = useParams();
  const [open, setOpen] = useState<boolean>(false);
  const [question, setQuestion] = useState<GetQuestionIdResponse>();
  const [repliedAnswer, setRepliedAnswer] = useState<{ id: number; answer: string }[]>();
  const [replyId, setReplyId] = useState<number | null>(null);
  const [replyResult, setReplyResult] = useState<ModifiedReply | null>(null);
  const { isLogin } = useSelector((rootState: RootState) => rootState.ui);

  useEffect(() => {
    if (!id) return;

    dispatch(startWaiting());
    questionEndpoint
      .getQuestionId(id ?? '')
      .then((res) => {
        if (res === undefined) {
          return;
        }
        setQuestion(res.data);
        setRepliedAnswer(res.data.minor.map((v) => ({ id: v.id, answer: '' })));

        const categoryId = res.data.category.id;
        dispatch(setCategoryId(categoryId));

        if (isLogin && res.data.lastReply === null)
          questionEndpoint.postQuestionStart({ id: parseInt(id.substring(3), 36) }).then((res) => {
            setReplyId(res?.data.id ?? null);
          });
        if (res.data.lastReply !== null) {
          if (res.data.lastReply.complete === false) {
            setReplyId(res.data.lastReply.id);
          } else {
            setReplyId(res.data.lastReply.id);
            setReplyResult(res.data.lastReply);
          }
        }
      })
      .finally(() => {
        dispatch(finishWaiting());
      });
  }, [id, isLogin]);

  const onClickSingle = (id: number) => (e: ChangeEvent<HTMLInputElement>) => {
    const thisAnswer = repliedAnswer?.map((r) =>
      r.id === id ? { ...r, answer: e.target.value } : r,
    );
    setRepliedAnswer(thisAnswer);
  };

  const onClickMultiple = (id: number) => (e: ChangeEvent<HTMLInputElement>) => {
    const thisAnswer = repliedAnswer?.map((r) => {
      if (r.id !== id) return r;
      const answerSet = r.answer === '' ? new Set() : new Set(r.answer.split(','));
      if (e.target.checked) answerSet.add(e.target.value);
      else answerSet.delete(e.target.value);
      return { ...r, answer: [...answerSet].sort().join(',') };
    });
    setRepliedAnswer(thisAnswer);
  };

  const onClickFill = (id: number, index: number) => (e: ChangeEvent<HTMLInputElement>) => {
    const thisAnswer = repliedAnswer?.map((r) => {
      if (r.id !== id) return r;
      const answers = r.answer === '' ? Array<string>() : r.answer.split(',');
      answers[index] = e.target.value;
      return { ...r, answer: answers.join(',') };
    });
    setRepliedAnswer(thisAnswer);
  };

  const onSubmit = () => {
    if (!id || !repliedAnswer || !replyId) return;

    dispatch(startWaiting());
    questionEndpoint
      .postQuestionComplete({
        id: parseInt(id.substring(3), 36),
        replyId,
        replied: repliedAnswer,
      })
      .then((res) => {
        setOpen(false);
        setReplyResult(res?.data ?? null);
      })
      .finally(() => {
        dispatch(finishWaiting());
      });
  };

  if (!question) return <div />;

  return (
    <div>
      <div className="mb-4 border p-4">
        <div>
          <p>
            類別:{' '}
            <span
              className="rounded px-1"
              style={{
                background: randomcolor({ luminosity: 'light', seed: question.category.id }),
              }}
            >
              {question.category.name}
            </span>
          </p>
          <p>出處: {question.source}</p>
          <p>
            題號: <span className="font-bold">{question.title}</span>
          </p>
          <p>
            標籤:{' '}
            {question.tag.map((t) => (
              <span
                key={t.id}
                className="mr-1 rounded px-1"
                style={{
                  background: randomcolor({ luminosity: 'light', seed: t.id }),
                }}
              >
                {t.name}
              </span>
            ))}
          </p>
        </div>
      </div>
      <MathJax dynamic>
        <div dangerouslySetInnerHTML={{ __html: question.content }}></div>
        {!replyResult && (
          <div className="mt-4 flex flex-col gap-2">
            {question.minor.map((v) => {
              if (v.type === 'SINGLE')
                return (
                  <div key={v.id}>
                    {v.content && <div>{v.content}</div>}
                    <div className="flex flex-wrap gap-2">
                      {v.options?.split(',').map((o) => (
                        <div className="flex items-center" key={v.id + ':' + o}>
                          <input
                            type="radio"
                            id={v.id + ':' + o}
                            name={v.id.toString()}
                            value={o}
                            onChange={onClickSingle(v.id)}
                          />
                          <label className="px-2" htmlFor={v.id + ':' + o}>
                            {o}
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              else if (v.type === 'MULTIPLE')
                return (
                  <div key={v.id}>
                    {v.content && <div>{v.content}</div>}
                    <div className="flex flex-wrap gap-2">
                      {v.options?.split(',').map((o) => (
                        <div className="flex items-center" key={v.id + ':' + o}>
                          <input
                            type="checkbox"
                            id={v.id + ':' + o}
                            name={v.id.toString()}
                            value={o}
                            onChange={onClickMultiple(v.id)}
                          />
                          <label className="px-2" htmlFor={v.id + ':' + o}>
                            {o}
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              else if (v.type === 'FILL')
                return (
                  <div key={v.id}>
                    {v.content && <div>{v.content}</div>}
                    {v.length &&
                      Array.from({ length: v.length }, (_, i) => i).map((n) => (
                        <div key={n} className="flex flex-wrap gap-2">
                          {v.options?.split(',').map((o) => (
                            <div className="flex items-center" key={v.id + ':' + n + ':' + o}>
                              <input
                                type="radio"
                                id={v.id + ':' + n + ':' + o}
                                name={v.id + ':' + n}
                                value={o}
                                onChange={onClickFill(v.id, n)}
                              />
                              <label className="px-2" htmlFor={v.id + ':' + n + ':' + o}>
                                {o}
                              </label>
                            </div>
                          ))}
                        </div>
                      ))}
                  </div>
                );
            })}
          </div>
        )}
      </MathJax>
      {!replyResult && (
        <div className="mt-4">
          <Button variant="contained" onClick={() => setOpen(true)} disabled={!isLogin}>
            送出
          </Button>
          {!isLogin && (
            <p className="text-rose-500">溫馨提醒：登入後，即可進行答題，並能使用完整功能</p>
          )}
        </div>
      )}
      {replyResult && (
        <>
          <div className="mt-4 border p-4">
            <div>
              <p>你的分數: {replyResult.score} (滿分1)</p>
              <p>你的答案: {replyResult.repliedAnswer}</p>
              <p>正確答案: {replyResult.actualAnswer}</p>
              {replyResult.fbPostId && (
                <p className="mt-2">
                  如果你有任何問題，歡迎到{' '}
                  <a
                    className="text-blue-600 underline"
                    href={`https://m.facebook.com/${replyResult.fbPostId.split('_')[0]}/posts/${replyResult.fbPostId.split('_')[1]}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    FB討論區
                  </a>{' '}
                  跟大家一起討論題目唷!
                </p>
              )}
            </div>
          </div>
          <div className="mt-4">
            <Button
              variant="outlined"
              onClick={() => navigate(`/list?categoryId=${question.category.id}`)}
            >
              回到題目清單
            </Button>
          </div>
        </>
      )}
      <Modal open={open} onClose={() => setOpen(false)}>
        <>
          <div>請確認你的答案</div>
          {repliedAnswer?.map((r, i) => (
            <div key={r.id}>
              {i + 1}. {r.answer === '' ? '未作答' : r.answer}
            </div>
          ))}
          <div className="mt-4 flex justify-end gap-4">
            <Button variant="outlined" color="error" onClick={() => setOpen(false)}>
              先等等
            </Button>
            <Button variant="contained" onClick={onSubmit}>
              確定送出
            </Button>
          </div>
        </>
      </Modal>
    </div>
  );
};

export default Question;
