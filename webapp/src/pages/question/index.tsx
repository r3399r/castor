import { useEffect, useState, type ChangeEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import questionEndpoint from 'src/api/questionEndpoint';
import type { Question } from 'src/model/backend/entity/QuestionEntity';
import IcLoader from 'src/assets/ic-loader.svg';
import { MathJax } from 'better-react-mathjax';
import { Button } from '@mui/material';
import Modal from 'src/components/Modal';
import type { GetQuestionIdResponse, ModifiedReply } from 'src/model/backend/api/Question';
import { useDispatch, useSelector } from 'react-redux';
import { finishWaiting, setCategoryId, startWaiting } from 'src/redux/uiSlice';
import { bn } from 'src/util/bignumber';
import randomcolor from 'randomcolor';
import type { RootState } from 'src/redux/store';

const Question = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { id } = useParams();
  const [open, setOpen] = useState<boolean>(false);
  const [question, setQuestion] = useState<GetQuestionIdResponse>();
  const [repliedAnswer, setRepliedAnswer] = useState<{ id: number; answer: string }[]>();
  const [seconds, setSeconds] = useState<number>(0);
  const [running, setRunning] = useState<boolean>(false);
  const [startTimestamp, setStartTimestamp] = useState<number>();
  const [showNotification, setShowNotification] = useState<boolean>(true);
  const [replyId, setReplyId] = useState<number | null>(null);
  const [replyResult, setReplyResult] = useState<ModifiedReply | null>(null);
  const { isLogin } = useSelector((rootState: RootState) => rootState.ui);

  useEffect(() => {
    if (!id || !isLogin) return;

    dispatch(startWaiting());
    questionEndpoint
      .getQuestionId(id ?? '')
      .then((res) => {
        if (res === undefined) {
          return;
        }
        setQuestion(res.data);
        setRepliedAnswer(res.data.minor.map((v) => ({ id: v.id, answer: '' })));

        const categoryId = res.data.categoryId;
        dispatch(setCategoryId(categoryId));

        if (res.data.lastReply === null) setShowNotification(true);
        else if (res.data.lastReply.complete === false) {
          setShowNotification(true);
          setReplyId(res.data.lastReply.id);
        } else {
          setShowNotification(false);
          setReplyId(res.data.lastReply.id);
          setReplyResult(res.data.lastReply);
          setSeconds(bn(res.data.lastReply.elapsedTimeMs).div(1000).dp(0).toNumber());
        }
      })
      .finally(() => {
        dispatch(finishWaiting());
      });
  }, [id, isLogin]);

  useEffect(() => {
    let interval: number | undefined;
    if (running) {
      interval = setInterval(() => {
        setSeconds((prev) => prev + 1);
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [running]);

  const onClickStart = () => {
    setShowNotification(false);
    setRunning((r) => !r);
    setStartTimestamp(Date.now());
    if (!!id && replyId === null)
      questionEndpoint.postQuestionStart({ id: parseInt(id.substring(3), 36) }).then((res) => {
        setReplyId(res?.data.id ?? null);
      });
  };

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

  const onSubmit = () => {
    if (!id || !repliedAnswer || !startTimestamp || !replyId) return;

    dispatch(startWaiting());
    questionEndpoint
      .postQuestionComplete({
        id: parseInt(id.substring(3), 36),
        replyId,
        elapsedTimeMs: Date.now() - startTimestamp,
        replied: repliedAnswer,
      })
      .then((res) => {
        setOpen(false);
        setReplyResult(res?.data ?? null);
        setRunning(false);
      })
      .finally(() => {
        dispatch(finishWaiting());
      });
  };

  const formatTime = (totalSeconds: number) => {
    const hrs = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    return [hrs, mins, secs].map((v) => String(v).padStart(2, '0')).join(':');
  };

  const msToMinSec = (ms: number): string => {
    if (Number.isNaN(ms)) return '00分00秒';
    const totalSeconds = Math.floor(ms / 1000);
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m}分${String(s).padStart(2, '0')}秒`;
  };

  if (!isLogin) return <div>請登入以繼續</div>;

  if (!question)
    return (
      <div className="flex items-center justify-center">
        <div className="w-20 outline-none">
          <img src={IcLoader} />
        </div>
      </div>
    );

  if (showNotification)
    return (
      <div>
        <div className="border p-4">
          <p>
            題目ID: <span className="font-bold text-blue-600">{question.uid}</span>
          </p>
          <p>
            標題: <span className="font-bold">{question.title}</span>
          </p>
          <p>
            Tag:{' '}
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
          {question.avgElapsedTimeMs && <p>平均耗時: {msToMinSec(question.avgElapsedTimeMs)}</p>}
          <p className="my-4">
            提醒您，在按下「開始」之後便會開始計時，請確保您有充足且完整的時間作答，以獲得客觀的統計結果。
          </p>
          <div className="text-center">
            <Button variant="contained" color="success" onClick={onClickStart}>
              開始
            </Button>
          </div>
        </div>
      </div>
    );

  return (
    <div>
      <div className="mb-2 text-xl font-bold">⏱️ {formatTime(seconds)}</div>
      <MathJax>
        <div dangerouslySetInnerHTML={{ __html: question.content }}></div>
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
          })}
        </div>
      </MathJax>
      {!replyResult && (
        <div className="mt-4 text-right">
          <Button variant="contained" onClick={() => setOpen(true)}>
            送出
          </Button>
        </div>
      )}
      {replyResult && (
        <>
          <div className="mt-4 border p-4">
            <div>
              <div>你的分數: {replyResult.score} (滿分1)</div>
              <div>你的答案: {replyResult.repliedAnswer}</div>
              <div>正確答案: {replyResult.actualAnswer}</div>
              {replyResult.fbPostId && (
                <div className="mt-2">
                  如果你有什麼想提問的，歡迎到{' '}
                  <a
                    className="text-blue-600 underline"
                    href={`https://facebook.com/${replyResult.fbPostId}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    討論區
                  </a>{' '}
                  跟大家一起討論題目唷!
                </div>
              )}
            </div>
          </div>
          <div className="mt-4">
            <Button
              variant="outlined"
              onClick={() => navigate(`/list?categoryId=${question.categoryId}`)}
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
