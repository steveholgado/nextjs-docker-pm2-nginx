import React from 'react'
import Link from 'next/link'

function About() {
  return (
    <>
      <Link href="/">
        <a>Home</a>
      </Link>
      <br />
      <Link href="/server-rendered">
        <a>Server Rendered</a>
      </Link>
      <h1>About</h1>
    </>
  )
}

export default About
