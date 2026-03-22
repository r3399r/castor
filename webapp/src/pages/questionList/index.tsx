import { FormControl, InputLabel, MenuItem, Select } from '@mui/material';
import { useEffect, useState } from 'react';
import categoryEndpoint from 'src/api/categoryEndpoint';
import subjectEndpoint from 'src/api/subjectEndpoint';
import type { Category } from 'src/model/backend/entity/CategoryEntity';
import type { ConceptGroup } from 'src/model/backend/entity/ConceptGroupEntity';
import type { Exam } from 'src/model/backend/entity/ExamEntity';
import type { Subject } from 'src/model/backend/entity/SubjectEntity';
import type { Tag } from 'src/model/backend/entity/TagEntity';

const QuestionList = () => {
  const [categoryId, setCategoryId] = useState<number>();
  const [categoryList, setCategoryList] = useState<Category[]>();
  const [subjectId, setSubjectId] = useState<number>();
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
    if (!categoryId) return;
    setSubjectId(undefined);
    categoryEndpoint.getCategoryIdSubject(categoryId).then((res) => {
      setSubjectList(res?.data);
    });
  }, [categoryId]);

  useEffect(() => {
    if (!subjectId) return;
    subjectEndpoint.getSubjectIdExam(subjectId).then((res) => {
      setExamList(res?.data);
    });
    subjectEndpoint.getSubjectIdConceptGroup(subjectId).then((res) => {
      setConceptGroupList(res?.data);
    });
    subjectEndpoint.getSubjectIdTag(subjectId).then((res) => {
      setTagList(res?.data);
    });
  }, [subjectId]);

  return (
    <>
      <div className="flex flex-col gap-4">
        <FormControl fullWidth>
          <InputLabel>選擇類別</InputLabel>
          <Select
            value={categoryId ?? ''}
            label="category"
            onChange={(e) => setCategoryId(Number(e.target.value))}
          >
            {categoryList?.map((item) => (
              <MenuItem value={item.id}>{item.name}</MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl fullWidth>
          <InputLabel>選擇科目</InputLabel>
          <Select
            value={subjectId ?? ''}
            label="subject"
            onChange={(e) => setSubjectId(Number(e.target.value))}
            disabled={!categoryId}
          >
            {subjectList?.map((item) => (
              <MenuItem value={item.id}>{item.name}</MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl fullWidth>
          <InputLabel>選擇試卷 (optional)</InputLabel>
          <Select
            // value={subjectId ?? ''}
            label="exam"
            // onChange={(e) => setSubjectId(Number(e.target.value))}
            disabled={!categoryId || !subjectId}
          >
            {examList?.map((item) => (
              <MenuItem value={item.id}>{item.name}</MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl fullWidth>
          <InputLabel>選擇觀念 (optional)</InputLabel>
          <Select
            // value={subjectId ?? ''}
            label="concept-group"
            // onChange={(e) => setSubjectId(Number(e.target.value))}
            disabled={!categoryId || !subjectId}
          >
            {conceptGroupList?.map((item) => (
              <MenuItem value={item.id}>{item.name}</MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl fullWidth>
          <InputLabel>選擇標籤 (optional)</InputLabel>
          <Select
            // value={subjectId ?? ''}
            label="tag"
            // onChange={(e) => setSubjectId(Number(e.target.value))}
            disabled={!categoryId || !subjectId}
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
