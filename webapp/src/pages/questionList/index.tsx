import {
  Button,
  Chip,
  FormControl,
  InputLabel,
  ListSubheader,
  MenuItem,
  Pagination,
  Rating,
  Select,
} from '@mui/material';
import { useEffect, useState } from 'react';
import categoryEndpoint from 'src/api/categoryEndpoint';
import questionEndpoint from 'src/api/questionEndpoint';
import subjectEndpoint from 'src/api/subjectEndpoint';
import { LIMIT } from 'src/constant/backend/Pagination';
import type { GetQuestionResponse } from 'src/model/backend/api/Question';
import type { Category } from 'src/model/backend/entity/CategoryEntity';
import type { ConceptGroup } from 'src/model/backend/entity/ConceptGroupEntity';
import type { Exam } from 'src/model/backend/entity/ExamEntity';
import type { Subject } from 'src/model/backend/entity/SubjectEntity';
import type { Tag } from 'src/model/backend/entity/TagEntity';

const QuestionList = () => {
  const [selectedCategoryId, setSelectedCategoryId] = useState<number>();
  const [selectedSubjectId, setSelectedSubjectId] = useState<number>();
  const [selectedExamId, setSelectedExamId] = useState<number>();
  const [selectedConceptIds, setSelectedConceptIds] = useState<number[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);
  const [categoryList, setCategoryList] = useState<Category[]>();
  const [subjectList, setSubjectList] = useState<Subject[]>();
  const [examList, setExamList] = useState<Exam[]>();
  const [conceptGroupList, setConceptGroupList] = useState<ConceptGroup[]>();
  const [tagList, setTagList] = useState<Tag[]>();
  const [resultQuestionList, setResultQuestionList] = useState<GetQuestionResponse>();
  const [openSolutionIds, setOpenSolutionIds] = useState<Set<number>>(new Set());
  console.log([...openSolutionIds]);
  useEffect(() => {
    categoryEndpoint.getCategory().then((res) => {
      setCategoryList(res?.data);
    });
  }, []);

  useEffect(() => {
    if (!selectedCategoryId) return;
    setSelectedSubjectId(undefined);
    setSelectedExamId(undefined);
    setSelectedConceptIds([]);
    setSelectedTagIds([]);
    // setResultQuestionList(undefined);
    categoryEndpoint.getCategoryIdSubject(selectedCategoryId).then((res) => {
      setSubjectList(res?.data);
    });
  }, [selectedCategoryId]);

  useEffect(() => {
    if (!selectedSubjectId) return;
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

  const onClickSearch = () => {
    if (!selectedSubjectId) return;
    questionEndpoint
      .getQuestion({
        subjectId: selectedSubjectId.toString(),
        examId: selectedExamId ? selectedExamId.toString() : undefined,
        conceptIds: selectedConceptIds ? selectedConceptIds.join(',') : undefined,
        tagIds: selectedTagIds ? selectedTagIds.join(',') : undefined,
      })
      .then((res) => {
        setResultQuestionList(res?.data);
      });
  };

  const onChangePage = (_event: React.ChangeEvent<unknown>, page: number) => {
    if (!selectedSubjectId) return;
    questionEndpoint
      .getQuestion({
        subjectId: selectedSubjectId.toString(),
        examId: selectedExamId ? selectedExamId.toString() : undefined,
        conceptIds: selectedConceptIds ? selectedConceptIds.join(',') : undefined,
        tagIds: selectedTagIds ? selectedTagIds.join(',') : undefined,
        offset: ((page - 1) * LIMIT).toString(),
      })
      .then((res) => {
        setResultQuestionList(res?.data);
      });
  };

  const onClickRevealSolution = (questionId: number) => {
    if (openSolutionIds.has(questionId))
      setOpenSolutionIds((prev) => {
        const newSet = new Set(prev);
        newSet.delete(questionId);
        return newSet;
      });
    else setOpenSolutionIds((prev) => new Set(prev).add(questionId));
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
            disabled={!selectedCategoryId}
          >
            {subjectList?.map((item) => (
              <MenuItem value={item.id}>{item.name}</MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl fullWidth>
          <InputLabel>選擇試卷 (非必填)</InputLabel>
          <Select
            value={selectedExamId ?? ''}
            label="exam"
            onChange={(e) => setSelectedExamId(e.target.value)}
            disabled={!selectedSubjectId}
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
            disabled={!selectedSubjectId}
            multiple
          >
            {conceptGroupList?.flatMap((item) => [
              <ListSubheader key={`sub-${item.id}`}>{item.name}</ListSubheader>,
              ...item.concepts.map((c) => (
                <MenuItem key={c.id} value={c.id}>
                  {c.name}
                </MenuItem>
              )),
            ])}
          </Select>
        </FormControl>
        <FormControl fullWidth>
          <InputLabel>選擇標籤 (非必填)</InputLabel>
          <Select
            value={selectedTagIds}
            label="tag"
            onChange={(e) => setSelectedTagIds(e.target.value as number[])}
            disabled={!selectedSubjectId}
            multiple
          >
            {tagList?.map((item) => (
              <MenuItem value={item.id}>{item.name}</MenuItem>
            ))}
          </Select>
        </FormControl>
        <div>
          <Button variant="contained" onClick={onClickSearch} disabled={!selectedSubjectId}>
            搜尋
          </Button>
        </div>
      </div>
      <hr className="my-4" />
      {resultQuestionList && resultQuestionList.data.length === 0 && <div>查無題目</div>}
      {resultQuestionList && resultQuestionList.data.length > 0 && (
        <div className="flex flex-col gap-4">
          {resultQuestionList.data.map((item) => (
            <div key={item.id} className="rounded-xl border">
              <div className="rounded-tl-xl rounded-tr-xl border-b bg-blue-100/80 p-2">
                <div className="flex items-center justify-between gap-2">
                  <div>{item.uuid.toUpperCase()}</div>
                  <Rating
                    value={item.adjustedDifficulty / 2}
                    precision={0.1}
                    readOnly
                    size="small"
                  />
                </div>
                <div className="mt-1 flex flex-wrap gap-2">
                  {item.exam.map((e) => (
                    <Chip key={e.id} label={e.name} size="small" color="success" />
                  ))}
                  {item.concept.map((c) => (
                    <Chip key={c.id} label={c.name} size="small" color="info" />
                  ))}
                  {item.tag.map((t) => (
                    <Chip key={t.id} label={t.name} size="small" color="warning" />
                  ))}
                </div>
              </div>
              <div className="p-4">
                {item.content && (
                  <>
                    <div dangerouslySetInnerHTML={{ __html: item.content }} />
                  </>
                )}
                {item.answer && (
                  <div className="mt-4 flex gap-2">
                    <Button
                      variant="outlined"
                      size="small"
                      onClick={() => onClickRevealSolution(item.id)}
                    >
                      看答案
                    </Button>
                  </div>
                )}
                <div>
                  {openSolutionIds.has(item.id) && item.answer && (
                    <div className="mt-4 rounded-lg border bg-green-100/80 p-4">
                      <div className="font-bold">解答</div>
                      <div dangerouslySetInnerHTML={{ __html: item.answer }} />
                    </div>
                  )}
                </div>
                {item.children.map((c) => (
                  <div key={c.id} className="mt-4">
                    <div dangerouslySetInnerHTML={{ __html: c.content ?? '' }} />
                    {c.answer && (
                      <div className="mt-4 flex gap-2">
                        <Button
                          variant="outlined"
                          size="small"
                          onClick={() => onClickRevealSolution(c.id)}
                        >
                          看答案
                        </Button>
                      </div>
                    )}
                    <div>
                      {openSolutionIds.has(c.id) && c.answer && (
                        <div className="mt-4 rounded-lg border bg-green-100/80 p-4">
                          <div className="font-bold">解答</div>
                          <div dangerouslySetInnerHTML={{ __html: c.answer }} />
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              {/* <div className="p-4">
                <div className="flex gap-2">
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={() => {
                      if (!openSolutionIds.has(item.id))
                        setOpenSolutionIds(prev => new Set(prev).add(item.id))
                      else setOpenSolutionIds(prev => {
                        const newSet = new Set(prev);
                        newSet.delete(item.id);
                        return newSet;
                      });
                    }
                    }
                  >
                    看答案
                  </Button>
                  <Button
                    variant="contained"
                    size="small"
                  >
                    討論區
                  </Button>
                </div>
                <div className="mt-4">
                  {openSolutionIds.has(item.id) && item.answer && (
                    <div className="rounded-lg border bg-green-100/80 p-4">
                      <div className="font-bold">解答</div>
                      <div dangerouslySetInnerHTML={{ __html: item.answer }} />
                    </div>
                  )}
                </div>
              </div> */}
            </div>
          ))}
          <div className="flex justify-center">
            <Pagination count={resultQuestionList.paginate.totalPages} onChange={onChangePage} />
          </div>
        </div>
      )}
    </>
  );
};

export default QuestionList;
