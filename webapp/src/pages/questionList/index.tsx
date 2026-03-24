import { FormControl, InputLabel, ListSubheader, MenuItem, Select } from '@mui/material';
import { useEffect, useState } from 'react';
import categoryEndpoint from 'src/api/categoryEndpoint';
import subjectEndpoint from 'src/api/subjectEndpoint';
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
      </div>
      <div>Question List</div>
    </>
  );
};

export default QuestionList;
