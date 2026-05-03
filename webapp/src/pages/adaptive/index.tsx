import {
  Button,
  Checkbox,
  Chip,
  FormControl,
  FormControlLabel,
  FormGroup,
  InputLabel,
  ListSubheader,
  MenuItem,
  Radio,
  RadioGroup,
  Rating,
  Select,
} from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import { useDispatch } from 'react-redux';
import categoryEndpoint from 'src/api/categoryEndpoint';
import questionEndpoint from 'src/api/questionEndpoint';
import replyEndpoint from 'src/api/replyEndpoint';
import subjectEndpoint from 'src/api/subjectEndpoint';
import type { PostReplyResponse } from 'src/model/backend/api/Reply';
import type { Category } from 'src/model/backend/entity/CategoryEntity';
import type { ConceptGroup } from 'src/model/backend/entity/ConceptGroupEntity';
import type { Exam } from 'src/model/backend/entity/ExamEntity';
import type { Question } from 'src/model/backend/entity/QuestionEntity';
import type { Subject } from 'src/model/backend/entity/SubjectEntity';
import type { Tag } from 'src/model/backend/entity/TagEntity';
import { finishWaiting, startWaiting } from 'src/redux/uiSlice';

const Adaptive = () => {
  const dispatch = useDispatch();
  const [selectedCategoryId, setSelectedCategoryId] = useState<number>();
  const [selectedSubjectId, setSelectedSubjectId] = useState<number>();
  const [selectedExamIds, setSelectedExamIds] = useState<number[]>([]);
  const [selectedConceptIds, setSelectedConceptIds] = useState<number[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);
  const [categoryList, setCategoryList] = useState<Category[]>();
  const [subjectList, setSubjectList] = useState<Subject[]>();
  const [examList, setExamList] = useState<Exam[]>();
  const [conceptGroupList, setConceptGroupList] = useState<ConceptGroup[]>();
  const [tagList, setTagList] = useState<Tag[]>();
  const [adaptiveQuestion, setAdaptiveQuestion] = useState<Question>();
  const [repliedAnswer, setRepliedAnswer] = useState<Map<number, string>>(new Map());
  const [replyResponse, setReplyResponse] = useState<PostReplyResponse>();
  const [questionCount, setQuestionCount] = useState<number>(-1);

  const canSubmit = useMemo(() => {
    if (!adaptiveQuestion) return false;
    if (adaptiveQuestion.type === 'GROUP') {
      return repliedAnswer.size === adaptiveQuestion.children.length;
    }
    return repliedAnswer.size === 1;
  }, [adaptiveQuestion, repliedAnswer]);

  const showConceptGroupHeader = useMemo(() => {
    if (!conceptGroupList) return false;
    for (const cg of conceptGroupList) {
      if (cg.concepts.length > 1) return true;
    }
    return false;
  }, [conceptGroupList]);

  useEffect(() => {
    categoryEndpoint.getCategory().then((res) => {
      setCategoryList(res?.data);
    });
  }, []);

  useEffect(() => {
    if (!selectedCategoryId) return;
    setSelectedSubjectId(undefined);
    setSelectedExamIds([]);
    setSelectedConceptIds([]);
    setSelectedTagIds([]);
    categoryEndpoint.getCategoryIdSubject(selectedCategoryId).then((res) => {
      setSubjectList(res?.data);
    });
  }, [selectedCategoryId]);

  useEffect(() => {
    if (!selectedSubjectId) return;
    if (selectedExamIds) setSelectedExamIds([]);
    if (selectedConceptIds.length > 0) setSelectedConceptIds([]);
    if (selectedTagIds.length > 0) setSelectedTagIds([]);
    subjectEndpoint.getSubjectIdExam(selectedSubjectId).then((res) => {
      setExamList(res?.data);
    });
    subjectEndpoint.getSubjectIdConceptGroup(selectedSubjectId).then((res) => {
      setConceptGroupList(res?.data);
    });
    subjectEndpoint.getSubjectIdTag(selectedSubjectId).then((res) => {
      setTagList(res?.data);
    });
  }, [selectedSubjectId]);

  useEffect(() => {
    if (!selectedSubjectId) return;
    setQuestionCount(-1);
    questionEndpoint
      .getQuestion({
        subjectId: selectedSubjectId.toString(),
        examIds: selectedExamIds.length > 0 ? selectedExamIds.join(',') : undefined,
        tagIds: selectedTagIds.length > 0 ? selectedTagIds.join(',') : undefined,
        conceptIds: selectedConceptIds.length > 0 ? selectedConceptIds.join(',') : undefined,
        limit: '1',
      })
      .then((res) => {
        if (res) setQuestionCount(res.data.paginate.total);
      });
  }, [selectedSubjectId, selectedExamIds, selectedConceptIds, selectedTagIds]);

  const onClickSearch = () => {
    if (!selectedSubjectId) return;
    setAdaptiveQuestion(undefined);
    setReplyResponse(undefined);
    setRepliedAnswer(new Map());
    dispatch(startWaiting());
    questionEndpoint
      .getQuestionAdaptive({
        subjectId: selectedSubjectId.toString(),
        examIds: selectedExamIds.length > 0 ? selectedExamIds.join(',') : undefined,
        conceptIds: selectedConceptIds.length > 0 ? selectedConceptIds.join(',') : undefined,
        tagIds: selectedTagIds.length > 0 ? selectedTagIds.join(',') : undefined,
      })
      .then((res) => {
        setAdaptiveQuestion(res?.data);
      })
      .finally(() => {
        dispatch(finishWaiting());
      });
  };

  const onSubmit = () => {
    if (!repliedAnswer) return;
    dispatch(startWaiting());
    replyEndpoint
      .postReply(
        [...repliedAnswer].map(([id, answer]) => ({
          questionId: id,
          repliedAnswer: answer,
        })),
      )
      .then((res) => {
        if (res) setReplyResponse(res.data);
      })
      .finally(() => {
        dispatch(finishWaiting());
      });
  };

  const getTypeName = (type: string) => {
    switch (type) {
      case 'SINGLE':
        return '單選題';
      case 'MULTIPLE':
        return '多選題';
      case 'TRUE_FALSE':
        return '是非題';
      case 'FILL':
        return '選填題';
      case 'GROUP':
        return '題組';
      default:
        return type;
    }
  };

  const Reply = ({ question }: { question: Question }) => {
    return (
      <>
        {question.type === 'TRUE_FALSE' && (
          <FormControl>
            <RadioGroup
              row
              value={repliedAnswer.get(question.id) ?? ''}
              onChange={(e) => {
                const newRepliedAnswer = new Map(repliedAnswer);
                newRepliedAnswer.set(question.id, e.target.value);
                setRepliedAnswer(newRepliedAnswer);
              }}
            >
              <FormControlLabel value="True" control={<Radio />} label="是" />
              <FormControlLabel value="False" control={<Radio />} label="非" />
            </RadioGroup>
          </FormControl>
        )}
        {question.type === 'SINGLE' && (
          <FormControl>
            <RadioGroup
              row
              value={repliedAnswer.get(question.id) ?? ''}
              onChange={(e) => {
                const newRepliedAnswer = new Map(repliedAnswer);
                newRepliedAnswer.set(question.id, e.target.value);
                setRepliedAnswer(newRepliedAnswer);
              }}
            >
              {question.options?.split('|').map((o, i) => (
                <FormControlLabel key={i} value={o} control={<Radio />} label={o} />
              ))}
            </RadioGroup>
          </FormControl>
        )}
        {question.type === 'MULTIPLE' && (
          <FormControl>
            <FormGroup row>
              {question.options?.split('|').map((o, i) => (
                <FormControlLabel
                  key={i}
                  checked={repliedAnswer.get(question.id)?.at(i) === 'O'}
                  onChange={(_, checked) => {
                    const newRepliedAnswer = new Map(repliedAnswer);
                    const prev =
                      newRepliedAnswer.get(question.id) ??
                      'X'.repeat(question.options!.split('|').length);
                    const newValue =
                      prev.substring(0, i) + (checked ? 'O' : 'X') + prev.substring(i + 1);
                    newRepliedAnswer.set(question.id, newValue);
                    setRepliedAnswer(newRepliedAnswer);
                  }}
                  value={o}
                  control={<Checkbox />}
                  label={o}
                />
              ))}
            </FormGroup>
          </FormControl>
        )}
        {question.type === 'FILL' && (
          <FormControl>
            {question.answer?.split('').map((_, i) => (
              <div className="flex items-center gap-2" key={i}>
                {i + 1}.
                <RadioGroup
                  row
                  value={repliedAnswer.get(question.id)?.at(i) ?? ''}
                  onChange={(e) => {
                    const newRepliedAnswer = new Map(repliedAnswer);
                    const prev =
                      newRepliedAnswer.get(question.id) ?? '@'.repeat(question.answer!.length);
                    const newValue = prev.substring(0, i) + e.target.value + prev.substring(i + 1);
                    newRepliedAnswer.set(question.id, newValue);
                    setRepliedAnswer(newRepliedAnswer);
                  }}
                >
                  {question.options?.split('|').map((o1, i1) => (
                    <FormControlLabel key={i1} value={o1} control={<Radio />} label={o1} />
                  ))}
                </RadioGroup>
              </div>
            ))}
          </FormControl>
        )}
      </>
    );
  };

  return (
    <>
      <div className="flex flex-col gap-4">
        <FormControl fullWidth>
          <InputLabel>選擇類別</InputLabel>
          <Select
            value={selectedCategoryId ?? ''}
            label="category"
            onChange={(e) => setSelectedCategoryId(e.target.value)}
            disabled={!!adaptiveQuestion}
          >
            {categoryList?.map((item) => (
              <MenuItem value={item.id}>{item.name}</MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl fullWidth>
          <InputLabel>選擇科目</InputLabel>
          <Select
            value={selectedSubjectId ?? ''}
            label="subject"
            onChange={(e) => setSelectedSubjectId(e.target.value)}
            disabled={!selectedCategoryId || !!adaptiveQuestion}
          >
            {subjectList?.map((item) => (
              <MenuItem value={item.id}>{item.name}</MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl fullWidth>
          <InputLabel>選擇試卷 (非必填)</InputLabel>
          <Select
            value={selectedExamIds}
            label="exam"
            onChange={(e) => setSelectedExamIds(e.target.value as number[])}
            disabled={!selectedSubjectId || !!adaptiveQuestion}
            multiple
          >
            {examList?.map((item) => (
              <MenuItem value={item.id}>{item.name}</MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl fullWidth>
          <InputLabel>選擇觀念 (非必填)</InputLabel>
          <Select
            value={selectedConceptIds}
            label="concept-group"
            onChange={(e) => setSelectedConceptIds(e.target.value as number[])}
            disabled={!selectedSubjectId || !!adaptiveQuestion}
            multiple
          >
            {conceptGroupList?.flatMap((item) =>
              showConceptGroupHeader
                ? [
                    <ListSubheader key={`sub-${item.id}`}>{item.name}</ListSubheader>,
                    ...item.concepts.map((c) => (
                      <MenuItem key={c.id} value={c.id}>
                        {c.name}
                      </MenuItem>
                    )),
                  ]
                : item.concepts.map((c) => (
                    <MenuItem key={c.id} value={c.id}>
                      {c.name}
                    </MenuItem>
                  )),
            )}
          </Select>
        </FormControl>
        {tagList && tagList.length > 0 && (
          <FormControl fullWidth>
            <InputLabel>選擇標籤 (非必填)</InputLabel>
            <Select
              value={selectedTagIds}
              label="tag"
              onChange={(e) => setSelectedTagIds(e.target.value as number[])}
              disabled={!selectedSubjectId || !!adaptiveQuestion}
              multiple
            >
              {tagList?.map((item) => (
                <MenuItem value={item.id}>{item.name}</MenuItem>
              ))}
            </Select>
          </FormControl>
        )}
        <div className="flex items-center gap-4">
          <Button
            variant="contained"
            onClick={onClickSearch}
            disabled={!selectedSubjectId || !!adaptiveQuestion || questionCount <= 0}
          >
            AI選題
          </Button>
          {questionCount >= 0 && <div>共有 {questionCount} 題符合條件</div>}
        </div>
      </div>
      <hr className="my-4" />
      {adaptiveQuestion && (
        <div className="rounded-xl border">
          <div className="rounded-tl-xl rounded-tr-xl border-b bg-blue-100/80 p-2">
            <div className="flex items-start justify-between gap-2">
              <div className="flex flex-wrap gap-2">
                <Chip label={getTypeName(adaptiveQuestion.type)} size="small" />
                {adaptiveQuestion.exam.map((e) => (
                  <Chip key={'e-' + e.id} label={e.name} size="small" color="success" />
                ))}
                {adaptiveQuestion.concept.map((c) => (
                  <Chip key={'c-' + c.id} label={c.name} size="small" color="info" />
                ))}
                {adaptiveQuestion.tag.map((t) => (
                  <Chip key={'t-' + t.id} label={t.name} size="small" color="warning" />
                ))}
              </div>
              <Rating
                value={
                  adaptiveQuestion.adjustedDifficulty / 2 < 0.5
                    ? 0.5
                    : adaptiveQuestion.adjustedDifficulty / 2
                }
                precision={0.1}
                readOnly
                size="small"
              />
            </div>
          </div>
          <div className="p-4">
            {adaptiveQuestion.content && (
              <>
                <div dangerouslySetInnerHTML={{ __html: adaptiveQuestion.content }} />
                <Reply question={adaptiveQuestion} />
                {replyResponse && replyResponse.at(0) && adaptiveQuestion.type !== 'GROUP' && (
                  <div>
                    <div>解答: {replyResponse.at(0)?.correctAnswer}</div>
                    <div>得分: {replyResponse.at(0)?.score}</div>
                  </div>
                )}
              </>
            )}
            {adaptiveQuestion.children.map((c, i) => (
              <div key={c.id} className="mt-4">
                <div dangerouslySetInnerHTML={{ __html: c.content ?? '' }} />
                <Reply question={c} />
                {replyResponse && replyResponse.at(i) && (
                  <div>
                    <div>解答: {replyResponse.at(i)?.correctAnswer}</div>
                    <div>得分: {replyResponse.at(i)?.score}</div>
                  </div>
                )}
              </div>
            ))}
            {replyResponse && replyResponse.at(0) && (
              <div>
                <a
                  href={`https://m.facebook.com/${replyResponse[0].fbPostId?.split('_')[0]}/posts/${replyResponse[0].fbPostId?.split('_')[1]}`}
                  target="_blank"
                  className="text-blue-600 underline"
                >
                  討論區
                </a>
              </div>
            )}
          </div>
        </div>
      )}
      {adaptiveQuestion && !replyResponse && (
        <div className="mt-4">
          <Button variant="contained" disabled={!canSubmit} onClick={onSubmit}>
            確認送出
          </Button>
        </div>
      )}
      {replyResponse && (
        <div className="mt-4 flex gap-4">
          <Button variant="contained" onClick={onClickSearch}>
            用相同條件再選下一題
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={() => {
              setAdaptiveQuestion(undefined);
              setReplyResponse(undefined);
              setRepliedAnswer(new Map());
              setSelectedExamIds([]);
              setSelectedConceptIds([]);
              setSelectedTagIds([]);
            }}
          >
            清除篩選條件
          </Button>
        </div>
      )}
    </>
  );
};

export default Adaptive;
