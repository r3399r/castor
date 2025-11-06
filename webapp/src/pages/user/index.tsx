import {
  Pagination,
  Paper,
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
import { setCategoryId as reduxSetCategoryId } from 'src/redux/uiSlice';
import randomcolor from 'randomcolor';
import type { RootState } from 'src/redux/store';

const LIMIT = 100;

const User = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [result, setResult] = useState<GetUserDetailResponse>();
  const [page, setPage] = useState<number>(1);
  const [count, setCount] = useState<number>();
  const [searchParams] = useSearchParams();
  const [categoryId, setCategoryId] = useState<number>();
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

    userEndpoint
      .getUserDetail({
        limit: LIMIT.toString(),
        offset: ((page - 1) * LIMIT).toString(),
        categoryId,
      })
      .then((res) => {
        setResult(res?.data);
        setCount(res?.data.reply.paginate.totalPages);
      });
  }, [page, categoryId]);

  return (
    <div>
      <div className="mb-2 text-2xl font-bold">答題記錄</div>
      <div>總答題數: {result?.count ?? '-'}</div>
      <div>平均得分: {result?.scoringRate ? bn(result.scoringRate).dp(2).toFormat() : '-'}</div>
      <div className="mt-2">
        <TableContainer component={Paper}>
          <Table sx={{ minWidth: 650 }} aria-label="simple table">
            <TableHead>
              <TableRow>
                <TableCell>答題時間</TableCell>
                <TableCell>題目ID</TableCell>
                <TableCell>標題</TableCell>
                <TableCell>Tag</TableCell>
                <TableCell>分數(滿分1)</TableCell>
                <TableCell>耗時(秒)</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {result?.reply.data.map((row) => (
                <TableRow key={row.id}>
                  <TableCell component="th" scope="row">
                    {format(new Date(row.createdAt ?? ''), 'yyyy/MM/dd HH:mm:ss')}
                  </TableCell>
                  <TableCell>
                    <a
                      href={`/q/${row.questionUid}`}
                      target="_blank"
                      className="text-blue-600 underline"
                    >
                      {row.questionUid}
                    </a>
                  </TableCell>
                  <TableCell>{row.questionTitle}</TableCell>
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
                  <TableCell>{bn(row.elapsedTimeMs).div(1000).dp(1).toFormat()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        <Pagination count={count} page={page} onChange={(_e, v) => setPage(v)} />
      </div>
    </div>
  );
};

export default User;
