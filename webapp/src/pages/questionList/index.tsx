import {
  Button,
  FormControl,
  InputLabel,
  MenuItem,
  Pagination,
  Paper,
  Select,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
} from '@mui/material';
import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate, useSearchParams } from 'react-router-dom';
import questionEndpoint from 'src/api/questionEndpoint';
import type { GetQuestionTagResponse, ModifiedQuestion } from 'src/model/backend/api/Question';
import {
  finishWaiting,
  setCategoryId as reduxSetCategoryId,
  setTag,
  startWaiting,
} from 'src/redux/uiSlice';
import { bn } from 'src/util/bignumber';
import randomcolor from 'randomcolor';
import type { RootState } from 'src/redux/store';

const LIMIT = 100;

const QuestionList = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [list, setList] = useState<ModifiedQuestion[]>();
  const [page, setPage] = useState<number>(1);
  const [count, setCount] = useState<number>();
  const [categoryId, setCategoryId] = useState<number>();
  const [titleQuery, setTitleQuery] = useState<string>();
  const [sorting, setSorting] = useState<string>();
  const [sortDirection, setSortDirection] = useState<'ASC' | 'DESC'>('ASC');
  const [sortValue, setSortValue] = useState<number>(1);
  const [showReply, setShowReply] = useState<'true' | 'false'>();
  const [showReplyValue, setShowReplyValue] = useState<number>(1);
  const [tagsFilter, setTagsFilter] = useState<string[]>();
  const [allTags, setAllTags] = useState<GetQuestionTagResponse>();
  const { tag } = useSelector((rootState: RootState) => rootState.ui);

  useEffect(() => {
    const tmpCategoryId = searchParams.get('categoryId');
    if (tmpCategoryId === null || isNaN(Number(tmpCategoryId))) {
      navigate('/category');
      return;
    }
    setCategoryId(Number(tmpCategoryId));
    dispatch(reduxSetCategoryId(Number(tmpCategoryId)));

    const tmpTitleQuery = searchParams.get('title');
    if (tmpTitleQuery !== null) setTitleQuery(tmpTitleQuery);

    const tmpSorting = searchParams.get('sorting');
    if (tmpSorting !== null) setSorting(tmpSorting);

    const tmpSortDirection = searchParams.get('sortDirection');
    if (tmpSortDirection !== null && (tmpSortDirection === 'ASC' || tmpSortDirection === 'DESC'))
      setSortDirection(tmpSortDirection);

    const tmpShowReply = searchParams.get('showReply');
    if (tmpShowReply !== null && (tmpShowReply === 'true' || tmpShowReply === 'false'))
      setShowReply(tmpShowReply);

    const tmpTagsFilter = searchParams.get('tagsFilter');
    if (tmpTagsFilter !== null) setTagsFilter(tmpTagsFilter.split(','));
  }, [searchParams, dispatch, navigate]);

  useEffect(() => {
    if (!categoryId) return;
    if (tag !== null && tag[categoryId] !== undefined) {
      setAllTags(tag[categoryId]);
      return;
    }

    dispatch(startWaiting());
    questionEndpoint
      .getQuestionTag({ categoryId })
      .then((res) => {
        if (!res) return;
        setAllTags(res.data);
        dispatch(setTag({ [categoryId]: res.data }));
      })
      .finally(() => {
        dispatch(finishWaiting());
      });
  }, [categoryId]);

  useEffect(() => {
    if (!categoryId) return;

    dispatch(startWaiting());
    questionEndpoint
      .getQuestion({
        limit: LIMIT.toString(),
        offset: ((page - 1) * LIMIT).toString(),
        categoryId,
        orderBy: sorting,
        orderDirection: sortDirection,
        title: titleQuery,
        hasReply: showReply,
        tags: tagsFilter ? tagsFilter.join() : undefined,
      })
      .then((res) => {
        setList(res?.data.data);
        setCount(res?.data.paginate.totalPages);
      })
      .finally(() => {
        dispatch(finishWaiting());
      });
  }, [page, categoryId, searchParams]);

  const applyFilters = (opts?: { replace?: boolean }) => {
    const sp = new URLSearchParams();
    if (categoryId) sp.set('categoryId', String(categoryId));
    if (titleQuery) sp.set('title', titleQuery);
    if (sorting) sp.set('sorting', sorting);
    if (sortDirection === 'DESC') sp.set('sortDirection', 'DESC');
    if (showReply) sp.set('showReply', showReply);
    if (tagsFilter && tagsFilter.length > 0) sp.set('tagsFilter', tagsFilter.join());
    setSearchParams(sp, { replace: !!opts?.replace });
  };

  const msToMinSec = (ms: number): string => {
    if (Number.isNaN(ms)) return '00分00秒';
    const totalSeconds = Math.floor(ms / 1000);
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m}分${String(s).padStart(2, '0')}秒`;
  };

  return (
    <div>
      <div className="text-2xl font-bold">
        題目清單 {list !== undefined && list.length > 0 ? `(${list[0].category.name})` : ''}
      </div>
      <div className="my-3 flex flex-col flex-wrap gap-3 xs:flex-row xs:items-center">
        <div className="xs:w-50">
          <TextField
            label="搜尋標題"
            fullWidth
            variant="standard"
            size="small"
            value={titleQuery}
            onChange={(e) => setTitleQuery(e.target.value)}
          />
        </div>
        <div className="xs:w-50">
          <FormControl fullWidth variant="standard">
            <InputLabel>排序方式</InputLabel>
            <Select
              size="small"
              value={sortValue}
              label="排序方式"
              onChange={(e) => {
                const value = e.target.value;
                setSortValue(value);
                if (value === 1) {
                  setSorting(undefined);
                  setSortDirection('ASC');
                } else if (value === 2 || value === 3) {
                  setSorting('scoringRate');
                  setSortDirection(value === 2 ? 'ASC' : 'DESC');
                } else if (value === 4 || value === 5) {
                  setSorting('avgElapsedTimeMs');
                  setSortDirection(value === 4 ? 'ASC' : 'DESC');
                }
              }}
            >
              <MenuItem value={1}>預設</MenuItem>
              <MenuItem value={2}>得分率(遞增)</MenuItem>
              <MenuItem value={3}>得分率(遞減)</MenuItem>
              <MenuItem value={4}>平均耗時(遞增)</MenuItem>
              <MenuItem value={5}>平均耗時(遞減)</MenuItem>
            </Select>
          </FormControl>
        </div>
        <div className="xs:w-50">
          <FormControl fullWidth variant="standard">
            <InputLabel>Tag</InputLabel>
            <Select
              size="small"
              value={tagsFilter ?? []}
              label="Tag"
              multiple
              onChange={(e) => {
                const value = e.target.value;
                setTagsFilter(typeof value === 'string' ? value.split(',') : value);
              }}
            >
              {allTags?.map((t) => (
                <MenuItem value={t.id.toString()}>{t.name}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </div>
        <div className="xs:w-50">
          <FormControl fullWidth variant="standard">
            <InputLabel>作答與否</InputLabel>
            <Select
              size="small"
              value={showReplyValue}
              label="作答與否"
              onChange={(e) => {
                const value = e.target.value;
                setShowReplyValue(value);
                if (value === 1) {
                  setShowReply(undefined);
                } else if (value === 2) {
                  setShowReply('false');
                } else if (value === 3) {
                  setShowReply('true');
                }
              }}
            >
              <MenuItem value={1}>顯示全部</MenuItem>
              <MenuItem value={2}>僅顯示未作答</MenuItem>
              <MenuItem value={3}>僅顯示已作答</MenuItem>
            </Select>
          </FormControl>
        </div>
        <Button variant="contained" onClick={() => applyFilters()}>
          搜尋
        </Button>
      </div>
      <TableContainer component={Paper}>
        <Table sx={{ minWidth: 650 }} aria-label="simple table">
          <TableHead>
            <TableRow>
              <TableCell>題目ID</TableCell>
              <TableCell>標題</TableCell>
              <TableCell>Tag</TableCell>
              <TableCell>得分率</TableCell>
              <TableCell>平均耗時</TableCell>
              <TableCell>是否作答</TableCell>
              <TableCell>來源</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {list?.map((row) => (
              <TableRow key={row.uid}>
                <TableCell component="th" scope="row">
                  <a
                    onClick={(e) => {
                      e.preventDefault();
                      navigate(`/q/${row.uid}`);
                    }}
                    href={`/q/${row.uid}`}
                    target="_self"
                    className="text-blue-600 underline"
                  >
                    {row.uid}
                  </a>
                </TableCell>
                <TableCell>{row.title}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {row.tag.map((t) => (
                      <div
                        key={t.id}
                        className="rounded px-1"
                        style={{
                          background: randomcolor({ luminosity: 'light', seed: t.id }),
                        }}
                      >
                        {t.name}
                      </div>
                    ))}
                  </div>
                </TableCell>
                <TableCell>
                  {row.scoringRate !== null
                    ? bn(row.scoringRate).times(100).dp(2).toFormat() + '%'
                    : '-'}
                </TableCell>
                <TableCell>
                  {row.avgElapsedTimeMs ? msToMinSec(row.avgElapsedTimeMs) : '-'}
                </TableCell>
                <TableCell>{row.lastReply?.complete === true ? '已作答' : '尚未作答'}</TableCell>
                <TableCell>{row.source ?? '-'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <Pagination count={count} page={page} onChange={(_e, v) => setPage(v)} />
    </div>
  );
};

export default QuestionList;
