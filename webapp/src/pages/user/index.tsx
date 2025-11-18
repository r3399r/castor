import {
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
} from '@mui/material';
import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import userEndpoint from 'src/api/userEndpoint';
import type { GetUserDetailResponse } from 'src/model/backend/api/User';
import { format } from 'date-fns';
import { bn } from 'src/util/bignumber';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  finishWaiting,
  setCategoryId as reduxSetCategoryId,
  startWaiting,
} from 'src/redux/uiSlice';
import randomcolor from 'randomcolor';
import type { RootState } from 'src/redux/store';

const LIMIT = 100;

const User = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [result, setResult] = useState<GetUserDetailResponse>();
  const [page, setPage] = useState<number>(1);
  const [count, setCount] = useState<number>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [categoryId, setCategoryId] = useState<number>();
  const [category, setCategory] = useState<{ id: number; name: string }[]>();
  const { isLogin } = useSelector((rootState: RootState) => rootState.ui);

  useEffect(() => {
    const tmpCategoryId = searchParams.get('categoryId');
    if (tmpCategoryId === null || isNaN(Number(tmpCategoryId))) {
      navigate('/category');
      return;
    }
    if (!isLogin) {
      navigate(`/list?categoryId=${tmpCategoryId}`);
    }
    setCategoryId(Number(tmpCategoryId));
    dispatch(reduxSetCategoryId(Number(tmpCategoryId)));
  }, [searchParams, isLogin]);

  useEffect(() => {
    if (!categoryId) return;

    dispatch(startWaiting());
    userEndpoint
      .getUserDetail({
        limit: LIMIT.toString(),
        offset: ((page - 1) * LIMIT).toString(),
        categoryId,
      })
      .then((res) => {
        setResult(res?.data);
        setCount(res?.data.reply.paginate.totalPages);
        setCategory(res?.data.category.map((v) => ({ id: v.id, name: v.name })));
      })
      .finally(() => {
        dispatch(finishWaiting());
      });
  }, [page, categoryId]);

  if (result?.reply.data.length === 0)
    return (
      <div>
        Hello! <span className="font-bold">{result.user?.name}</span>，資料庫尚無您的答題記錄。
      </div>
    );

  return (
    <div>
      {category && category.length > 1 && (
        <FormControl variant="standard">
          <InputLabel>切換類別</InputLabel>
          <Select
            size="small"
            value={categoryId}
            label="排序方式"
            onChange={(e) => {
              const sp = new URLSearchParams();
              sp.set('categoryId', String(e.target.value));
              setSearchParams(sp, { replace: true });
            }}
          >
            {category.map((v) => (
              <MenuItem value={v.id}>{v.name}</MenuItem>
            ))}
          </Select>
        </FormControl>
      )}
      <div className="my-2">
        <span className="font-bold">{result?.user?.name}</span>，您好！此頁面為您在{' '}
        <span className="font-bold">{category?.find((v) => v.id === categoryId)?.name}</span>{' '}
        的答題記錄。
      </div>
      <div>總答題數: {result?.count ?? '-'}</div>
      <div>
        平均得分:{' '}
        {result && result.scoringRate !== null ? bn(result.scoringRate).dp(2).toFormat() : '-'}
      </div>
      {result && result.reply.data.length > 0 && (
        <div className="mt-2">
          <TableContainer component={Paper}>
            <Table sx={{ minWidth: 650 }} aria-label="simple table">
              <TableHead>
                <TableRow>
                  <TableCell>時間</TableCell>
                  <TableCell>題目名稱</TableCell>
                  <TableCell>標籤</TableCell>
                  <TableCell>分數(滿分1)</TableCell>
                  <TableCell>耗時(秒)</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {result?.reply.data.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell component="th" scope="row">
                      {format(new Date(row.recordedAt ?? ''), 'yyyy/MM/dd HH:mm:ss')}
                    </TableCell>
                    <TableCell>
                      <a
                        onClick={(e) => {
                          e.preventDefault();
                          navigate(`/q/${row.questionUid}`);
                        }}
                        href={`/q/${row.questionUid}`}
                        target="_self"
                        className="text-blue-600 underline"
                      >
                        {row.questionTitle}-{row.questionUid}
                      </a>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
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
                    <TableCell>{row.score}</TableCell>
                    <TableCell>
                      {row.complete === false
                        ? '尚未完成作答'
                        : bn(row.elapsedTimeMs).div(1000).dp(1).toFormat()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          <div className="mt-3 flex justify-center">
            <Pagination count={count} page={page} onChange={(_e, v) => setPage(v)} />
          </div>
        </div>
      )}
    </div>
  );
};

export default User;
