import {
  Button,
  FormControl,
  InputLabel,
  ListSubheader,
  MenuItem,
  Select,
  TextField,
} from '@mui/material';
import { MathJax } from 'better-react-mathjax';
import { useEffect, useMemo, useState } from 'react';
import { useDispatch } from 'react-redux';
import categoryEndpoint from 'src/api/categoryEndpoint';
import previewEndpoint from 'src/api/previewEndpoint';
import subjectEndpoint from 'src/api/subjectEndpoint';
import type { PostQuestionRequest } from 'src/model/backend/api/Question';
import type { Category } from 'src/model/backend/entity/CategoryEntity';
import type { ConceptGroup } from 'src/model/backend/entity/ConceptGroupEntity';
import type { Exam } from 'src/model/backend/entity/ExamEntity';
import type { Subject } from 'src/model/backend/entity/SubjectEntity';
import type { Tag } from 'src/model/backend/entity/TagEntity';
import { finishWaiting, startWaiting } from 'src/redux/uiSlice';

const Preview = () => {
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
  const [imageUrl, setImageUrl] = useState<string>('');
  const [geminiOutput, setGeminiOutput] = useState<string>('');
  const [questionInput, setQuestionInput] = useState<string>('');

  const payload = useMemo(() => {
    try {
      return JSON.parse(questionInput) as Partial<PostQuestionRequest>;
    } catch {
      return null;
    }
  }, [questionInput]);

  const showConceptGroupHeader = useMemo(() => {
    if (!conceptGroupList) return false;
    conceptGroupList.forEach((g) => {
      if (g.concepts.length > 1) return true;
    });
    return false;
  }, [conceptGroupList]);

  const geminiInput = useMemo(() => {
    let text =
      '圖片為科目: ' +
      subjectList?.find((s) => s.id === selectedSubjectId)?.name +
      ' 的一道題目，請提供以下資訊: ';
    text += '(1) 轉換成 html with <br/> ';
    text += '(2) 簡短的純文字詳解，註記此詳解為AI生成 ';
    text += '(3) 難易度 (簡單=2,中等=5,困難=8) ';
    text +=
      '(4) 從下述觀念清單中選擇至少一個: (' +
      conceptGroupList?.flatMap((g) => g.concepts.map((c) => c.name + '=' + c.id)).join(', ');
    text +=
      ')。以 json 格式回覆，格式如下: {"content": (1) in string, "solution": (2) in string, "difficulty": (3) in number, "conceptIds": (4) in number array} without markdown code block. 只回覆 json，不要其他文字說明。';
    return text;
  }, [conceptGroupList, subjectList, selectedSubjectId]);

  const onClickAskGemini = () => {
    dispatch(startWaiting());
    previewEndpoint
      .postPreview({
        text: geminiInput,
        imageUrl,
      })
      .then((res) => {
        const formattedOutput = JSON.stringify(res?.data, null, 2) ?? '';
        setGeminiOutput(formattedOutput);
      })
      .finally(() => {
        dispatch(finishWaiting());
      });
  };

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
    setSelectedExamIds([]);
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

  useEffect(() => {
    setQuestionInput(
      JSON.stringify(
        {
          subjectId: selectedSubjectId,
          type: 'SINGLE',
          imageUrl: imageUrl,
          content: 'xxx',
          options: 'A|B|C|D',
          answer: 'B',
          solution: 'xxx',
          difficulty: -1,
          examId: selectedExamIds.length > 0 ? selectedExamIds[0] : undefined,
          tagIds: selectedTagIds.length > 0 ? selectedTagIds : undefined,
          conceptIds: selectedConceptIds.length > 0 ? selectedConceptIds : undefined,
        },
        null,
        2,
      ),
    );
  }, [selectedSubjectId, imageUrl, selectedExamIds, selectedConceptIds, selectedTagIds]);

  useEffect(() => {
    try {
      const parsedGeminiOutput = JSON.parse(geminiOutput);
      const parsedQuestionInput = JSON.parse(questionInput);
      const updatedQuestionInput = {
        ...parsedQuestionInput,
        ...parsedGeminiOutput,
      };
      setQuestionInput(JSON.stringify(updatedQuestionInput, null, 2));
    } catch {
      console.log('Invalid Gemini output, cannot update question input');
    }
  }, [geminiOutput]);

  return (
    <div>
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
            value={selectedExamIds}
            label="exam"
            onChange={(e) => setSelectedExamIds(e.target.value as number[])}
            disabled={!selectedSubjectId}
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
            disabled={!selectedSubjectId}
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
              disabled={!selectedSubjectId}
              multiple
            >
              {tagList?.map((item) => (
                <MenuItem value={item.id}>{item.name}</MenuItem>
              ))}
            </Select>
          </FormControl>
        )}
      </div>
      <div>Selected Subject ID: {selectedSubjectId}</div>
      <div>
        Selected Exam IDs: {selectedExamIds.length === 0 ? 'None' : selectedExamIds.join(', ')}
      </div>
      <div>
        Selected Concept IDs:{' '}
        {selectedConceptIds.length === 0 ? 'None' : selectedConceptIds.join(', ')}
      </div>
      <div>
        Selected Tag IDs: {selectedTagIds.length === 0 ? 'None' : selectedTagIds.join(', ')}
      </div>
      <hr className="my-4" />
      <h2 className="mb-2 text-xl font-bold">Gemini Input:</h2>
      <div>{geminiInput}</div>
      <TextField
        label="Image URL"
        fullWidth
        value={imageUrl}
        onChange={(e) => setImageUrl(e.target.value)}
      />
      <div className="mt-2">
        <Button
          variant="contained"
          disabled={imageUrl.length === 0 || !selectedSubjectId}
          onClick={onClickAskGemini}
        >
          Ask Gemini
        </Button>
      </div>
      <div className="mt-4">
        <h2 className="mb-2 text-xl font-bold">Gemini Output:</h2>
        <textarea
          className="h-80 w-full border p-4"
          value={geminiOutput}
          onChange={(e) => setGeminiOutput(e.target.value)}
        />
      </div>
      <hr className="my-4" />
      <h2 className="mb-2 text-xl font-bold">Input:</h2>
      <textarea
        className="h-80 w-full border p-4"
        value={questionInput}
        onChange={(e) => setQuestionInput(e.target.value)}
        placeholder="Enter content to preview"
      />
      <h3 className="mt-2 font-bold">Parent Question</h3>
      <div>subjectId: {payload?.subjectId ?? 'Not specified'}</div>
      <div>
        type: {payload?.type ?? 'Not specified'}{' '}
        {payload?.type === 'GROUP' && payload.childQuestions?.length === 0 && (
          <span className="text-red-500">題組必須有子題</span>
        )}
      </div>
      <div>imageUrl: {payload?.imageUrl ?? 'Not specified'}</div>
      <div>content: {payload?.content ?? 'Not specified'}</div>
      <div>options: {payload?.options ?? 'Not specified'}</div>
      <div>answer: {payload?.answer ?? 'Not specified'}</div>
      <div>solution: {payload?.solution ?? 'Not specified'}</div>
      <div>difficulty: {payload?.difficulty ?? 'Not specified'}</div>
      <div>examId: {payload?.examId ?? 'Not specified'}</div>
      <div>tagIds: {payload?.tagIds?.join(', ') ?? 'Not specified'}</div>
      <div>conceptIds: {payload?.conceptIds?.join(', ') ?? 'Not specified'}</div>
      {payload?.childQuestions?.map((child, index) => (
        <div key={index}>
          <h3 className="mt-2 font-bold">Child Question {index + 1}:</h3>
          <div>type: {child.type ?? 'Not specified'}</div>
          <div>sortOrder: {child.sortOrder ?? 'Not specified'}</div>
          <div>content: {child.content ?? 'Not specified'}</div>
          <div>options: {child.options ?? 'Not specified'}</div>
          <div>answer: {child.answer ?? 'Not specified'}</div>
          <div>difficulty: {child.difficulty ?? 'Not specified'}</div>
        </div>
      ))}
      <div className="mt-4 w-full">
        <h2 className="mb-2 text-xl font-bold">Preview:</h2>
        <div className="border p-4">
          <MathJax dynamic>
            <div dangerouslySetInnerHTML={{ __html: payload?.content ?? '' }}></div>
            {payload?.childQuestions?.map((child, index) => (
              <div key={index} dangerouslySetInnerHTML={{ __html: child.content ?? '' }} />
            ))}
          </MathJax>
        </div>
      </div>
    </div>
  );
};

export default Preview;
