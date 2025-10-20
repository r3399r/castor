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
import { useSelector } from 'react-redux';
import userEndpoint from 'src/api/userEndpoint';
import type { GetUserDetailResponse } from 'src/model/backend/api/User';
import type { RootState } from 'src/redux/store';
import { format } from 'date-fns';
import { bn } from 'src/util/bignumber';

const LIMIT = 100;

const User = () => {
  const { categoryId } = useSelector((state: RootState) => state.ui);
  const [result, setResult] = useState<GetUserDetailResponse>();
  const [page, setPage] = useState<number>(1);
  const [count, setCount] = useState<number>();

  useEffect(() => {
    userEndpoint
      .getUserDetail({
        limit: LIMIT.toString(),
        offset: ((page - 1) * LIMIT).toString(),
        categoryId: categoryId ?? 0,
      })
      .then((res) => {
        setResult(res?.data);
        setCount(res?.data.reply.paginate.totalPages);
      });
  }, [page]);

  return (
    <div>
      <div className="mb-2 text-2xl font-bold">答題記錄</div>
      <div>總答題數: {result?.count ?? '-'}</div>
      <div>平均得分: {result?.scoringRate ?? '-'}</div>
      <div className="mt-2">
        <TableContainer component={Paper}>
          <Table sx={{ minWidth: 650 }} aria-label="simple table">
            <TableHead>
              <TableRow>
                <TableCell>答題時間</TableCell>
                <TableCell>題目ID</TableCell>
                <TableCell>標籤</TableCell>
                <TableCell>得分</TableCell>
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
                      href={`/question/${row.questionUid}`}
                      target="_blank"
                      className="text-blue-600 underline"
                    >
                      {row.questionUid}
                    </a>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {row.tag.map((t) => (
                        <div className="rounded border px-1">{t.name}</div>
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
