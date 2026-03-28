import {
  Button,
  Chip,
  FormControl,
  InputLabel,
  ListSubheader,
  MenuItem,
  Rating,
  Select,
} from '@mui/material';
import { useEffect, useState } from 'react';
import categoryEndpoint from 'src/api/categoryEndpoint';
import questionEndpoint from 'src/api/questionEndpoint';
import subjectEndpoint from 'src/api/subjectEndpoint';
import type { Category } from 'src/model/backend/entity/CategoryEntity';
import type { ConceptGroup } from 'src/model/backend/entity/ConceptGroupEntity';
import type { Exam } from 'src/model/backend/entity/ExamEntity';
import type { Question } from 'src/model/backend/entity/QuestionEntity';
import type { Subject } from 'src/model/backend/entity/SubjectEntity';
import type { Tag } from 'src/model/backend/entity/TagEntity';

const Adaptive = () => {
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
  const [adaptiveQuestion, setAdaptiveQuestion] = useState<Question>();

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
    categoryEndpoint.getCategoryIdSubject(selectedCategoryId).then((res) => {
      setSubjectList(res?.data);
    });
  }, [selectedCategoryId]);

  useEffect(() => {
    if (!selectedSubjectId) return;
    setSelectedExamId(undefined);
    setSelectedConceptIds([]);
    setSelectedTagIds([]);
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
      .getQuestionAdaptive({
        subjectId: selectedSubjectId.toString(),
        examId: selectedExamId ? selectedExamId.toString() : undefined,
        conceptIds: selectedConceptIds.length > 0 ? selectedConceptIds.join(',') : undefined,
        tagIds: selectedTagIds.length > 0 ? selectedTagIds.join(',') : undefined,
      })
      .then((res) => {
        setAdaptiveQuestion(res?.data);
      });
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
            value={selectedExamId ?? ''}
            label="exam"
            onChange={(e) => setSelectedExamId(e.target.value)}
            disabled={!selectedSubjectId || !!adaptiveQuestion}
          >
            <MenuItem value="">
              <em>無</em>
            </MenuItem>
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
            disabled={!selectedSubjectId || !!adaptiveQuestion}
            multiple
          >
            {tagList?.map((item) => (
              <MenuItem value={item.id}>{item.name}</MenuItem>
            ))}
          </Select>
        </FormControl>
        <div>
          <Button
            variant="contained"
            onClick={onClickSearch}
            disabled={!selectedSubjectId || !!adaptiveQuestion}
          >
            AI選題
          </Button>
        </div>
      </div>
      <hr className="my-4" />
      {adaptiveQuestion && (
        <div className="rounded-xl border">
          <div className="rounded-tl-xl rounded-tr-xl border-b bg-blue-100/80 p-2">
            <div className="flex items-center justify-between gap-2">
              <div>{adaptiveQuestion.uuid.toUpperCase()}</div>
              <Rating
                value={adaptiveQuestion.adjustedDifficulty / 2}
                precision={0.1}
                readOnly
                size="small"
              />
            </div>
            <div className="mt-1 flex flex-wrap gap-2">
              {adaptiveQuestion.exam.map((e) => (
                <Chip key={e.id} label={e.name} size="small" color="success" />
              ))}
              {adaptiveQuestion.concept.map((c) => (
                <Chip key={c.id} label={c.name} size="small" color="info" />
              ))}
              {adaptiveQuestion.tag.map((t) => (
                <Chip key={t.id} label={t.name} size="small" color="warning" />
              ))}
            </div>
          </div>
          <div className="p-4">
            {adaptiveQuestion.content && (
              <div dangerouslySetInnerHTML={{ __html: adaptiveQuestion.content }} />
            )}
            {adaptiveQuestion.children.map((c) => (
              <div key={c.id} className="mt-4">
                <div dangerouslySetInnerHTML={{ __html: c.content ?? '' }} />
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
};

export default Adaptive;
