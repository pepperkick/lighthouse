import axios from 'axios';

async function main() {
  const res = await axios.get("http://google.com", {});
  await axios.get("http://abc.com");
}

main()