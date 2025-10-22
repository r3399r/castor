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
import { format } from 'date-fns';
import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import questionEndpoint from 'src/api/questionEndpoint';
import type { ModifiedQuestion } from 'src/model/backend/api/Question';
import type { RootState } from 'src/redux/store';
import { bn } from 'src/util/bignumber';

const LIMIT = 100;

const QuestionList = () => {
  const { categoryId } = useSelector((state: RootState) => state.ui);
  const [list, setList] = useState<ModifiedQuestion[]>();
  const [page, setPage] = useState<number>(1);
  const [count, setCount] = useState<number>();

  useEffect(() => {
    questionEndpoint
      .getQuestion({
        limit: LIMIT.toString(),
        offset: ((page - 1) * LIMIT).toString(),
        categoryId: categoryId ?? 0,
      })
      .then((res) => {
        setList(res?.data.data);
        setCount(res?.data.paginate.totalPages);
      });
  }, [page]);

  return (
    <div>
      <div className="mb-2 text-2xl font-bold">題目清單</div>
      <TableContainer component={Paper}>
        <Table sx={{ minWidth: 650 }} aria-label="simple table">
          <TableHead>
            <TableRow>
              <TableCell>題目ID</TableCell>
              <TableCell>標題</TableCell>
              <TableCell>Tag</TableCell>
              <TableCell>得分率</TableCell>
              <TableCell>平均耗時(秒)</TableCell>
              <TableCell>答題於</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {list?.map((row) => (
              <TableRow key={row.uid}>
                <TableCell component="th" scope="row">
                  <a
                    href={`/q/${row.uid}`}
                    target="_blank"
                    className="text-blue-600 underline"
                  >
                    {row.uid}
                  </a>
                </TableCell>
                <TableCell>{row.title}</TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    {row.tag.map((t) => (
                      <div className="rounded border px-1">{t.name}</div>
                    ))}
                  </div>
                </TableCell>
                <TableCell>
                  {row.scoringRate ? bn(row.scoringRate).times(100).dp(2).toFormat() + '%' : '-'}
                </TableCell>
                <TableCell>{bn(row.avgElapsedTimeMs).div(1000).dp(1).toFormat()}</TableCell>
                <TableCell>
                  {row.lastRepliedAt
                    ? format(new Date(row.lastRepliedAt ?? ''), 'yyyy/MM/dd HH:mm:ss')
                    : '尚未答題'}
                </TableCell>
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
